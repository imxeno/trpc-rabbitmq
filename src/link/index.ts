import { TRPCClientError, TRPCLink } from '@trpc/client';
import type { AnyRouter } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import * as amqp from 'amqp-connection-manager';
import { randomUUID } from 'crypto';
import EventEmitter from 'events';
import { parse, stringify } from 'superjson';

import type { TRPCRMQRequest, TRPCRMQResponse } from '../types';

const REPLY_QUEUE = 'amq.rabbitmq.reply-to';

export type TRPCRMQLinkOptions = {
  url: string;
  queue: string;
  durable?: boolean;
};

export const rmqLink = <TRouter extends AnyRouter>(opts: TRPCRMQLinkOptions): TRPCLink<TRouter> => {
  return runtime => {
    const { url, queue, durable } = opts;
    const responseEmitter = new EventEmitter();
    responseEmitter.setMaxListeners(0);

    const connection = amqp.connect(url);
    const channel = connection.createChannel({
      setup: async (channel: amqp.Channel) => {
        await channel.assertQueue(queue, { durable });
        await channel.consume(
          REPLY_QUEUE,
          msg => {
            if (!msg) return;
            responseEmitter.emit(
              msg.properties.correlationId as string,
              parse(msg.content.toString('utf-8'))
            );
          },
          { noAck: true }
        );
      }
    });

    const sendToQueue = async (message: TRPCRMQRequest) =>
      new Promise<any>(resolve => {
        const correlationId = randomUUID();
        responseEmitter.once(correlationId, resolve);
        void channel.sendToQueue(queue, Buffer.from(stringify(message)), {
          correlationId,
          replyTo: REPLY_QUEUE
        });
      });

    return ({ op }) => {
      return observable(observer => {
        const { id, type, path } = op;

        try {
          const input = runtime.transformer.serialize(op.input);

          const onMessage = (message: TRPCRMQResponse) => {
            if (!('trpc' in message)) return;
            const { trpc } = message;
            if (!trpc) return;
            if (!('id' in trpc) || trpc.id === null || trpc.id === undefined) return;
            if (id !== trpc.id) return;

            if ('error' in trpc) {
              const error = runtime.transformer.deserialize(trpc.error);
              observer.error(TRPCClientError.from({ ...trpc, error }));
              return;
            }

            observer.next({
              result: {
                ...trpc.result,
                ...((!trpc.result.type || trpc.result.type === 'data') && {
                  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                  data: runtime.transformer.deserialize(trpc.result.data)!
                })
              }
            });

            observer.complete();
          };

          sendToQueue({
            trpc: {
              id,
              method: type,
              params: { path, input }
            }
          })
            .then(onMessage)
            .catch(cause => {
              observer.error(
                new TRPCClientError(cause instanceof Error ? cause.message : 'Unknown error')
              );
            });
        } catch (cause) {
          observer.error(
            new TRPCClientError(cause instanceof Error ? cause.message : 'Unknown error')
          );
        }

        // eslint-disable-next-line @typescript-eslint/no-empty-function
        return () => {};
      });
    };
  };
};
