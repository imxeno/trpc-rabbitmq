import {
  AnyRouter,
  ProcedureType,
  TRPCError,
  callProcedure,
  inferRouterContext
} from '@trpc/server';
import type { OnErrorFunction } from '@trpc/server/dist/internals/types';
import * as amqp from 'amqp-connection-manager';
import type { ConsumeMessage } from 'amqplib';
import { parse, stringify } from 'superjson';

import { getErrorFromUnknown } from './errors';

const AMQP_METHOD_PROCEDURE_TYPE_MAP: Record<string, ProcedureType | undefined> = {
  query: 'query',
  mutation: 'mutation'
};

export type CreateRMQHandlerOptions<TRouter extends AnyRouter> = {
  url: string;
  queue: string;
  router: TRouter;
  durable?: boolean;
  onError?: OnErrorFunction<TRouter, ConsumeMessage>;
};

export const createRMQHandler = <TRouter extends AnyRouter>(
  opts: CreateRMQHandlerOptions<TRouter>
) => {
  const { url, queue, router, durable, onError } = opts;

  const connection = amqp.connect(url);
  connection.createChannel({
    setup: async (channel: amqp.Channel) => {
      await channel.assertQueue(queue, { durable });

      void channel.consume(opts.queue, async msg => {
        if (!msg) return;
        channel.ack(msg);
        const { correlationId, replyTo } = msg.properties;
        if (!correlationId || !replyTo) return;
        const res = await handleMessage(router, msg, onError);
        if (!res) return;
        void channel.sendToQueue(replyTo as string, Buffer.from(stringify({ trpc: res })), {
          correlationId: correlationId as string
        });
      });
    }
  });

  return { close: () => connection.close() };
};

async function handleMessage<TRouter extends AnyRouter>(
  router: TRouter,
  msg: ConsumeMessage,
  onError?: OnErrorFunction<TRouter, ConsumeMessage>
) {
  const { transformer } = router._def._config;

  try {
    const message: any = parse(msg.content.toString('utf-8'));
    if (!('trpc' in message)) return;
    const { trpc } = message;
    if (!('id' in trpc) || trpc.id === null || trpc.id === undefined) return;
    if (!trpc) return;

    const { id, params } = trpc;
    const type = AMQP_METHOD_PROCEDURE_TYPE_MAP[trpc.method] ?? ('query' as const);
    const ctx: inferRouterContext<TRouter> | undefined = undefined;

    try {
      const path = params.path;

      if (!path) {
        throw new Error('No path provided');
      }

      if (type === 'subscription') {
        throw new TRPCError({
          message: 'RabbitMQ link does not support subscriptions (yet?)',
          code: 'METHOD_NOT_SUPPORTED'
        });
      }

      const deserializeInputValue = (rawValue: unknown) => {
        return typeof rawValue !== 'undefined' ? transformer.input.deserialize(rawValue) : rawValue;
      };

      const input = deserializeInputValue(params.input);

      const output = await callProcedure({
        procedures: router._def.procedures,
        path,
        rawInput: input,
        ctx,
        type
      });

      return {
        id,
        result: {
          type: 'data',
          data: output
        }
      };
    } catch (cause) {
      const error = getErrorFromUnknown(cause);
      onError?.({
        error,
        type,
        path: trpc?.path,
        input: trpc?.input,
        ctx,
        req: msg
      });

      return {
        id,
        error: router.getErrorShape({
          error,
          type,
          path: trpc?.path,
          input: trpc?.input,
          ctx
        })
      };
    }
  } catch (cause) {
    // TODO: Assume json parsing error (so shouldn't happen), but we need to handle this better
    return {};
  }
}
