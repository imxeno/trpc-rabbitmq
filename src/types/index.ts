import type {
  TRPCClientOutgoingMessage,
  TRPCErrorResponse,
  TRPCRequest,
  TRPCResultMessage
} from '@trpc/server/rpc';

export type TRPCRMQRequest = {
  trpc: TRPCRequest | TRPCClientOutgoingMessage;
};

export type TRPCRMQSuccessResponse = {
  trpc: TRPCResultMessage<any>;
};

export type TRPCRMQErrorResponse = {
  trpc: TRPCErrorResponse;
};

export type TRPCRMQResponse = TRPCRMQSuccessResponse | TRPCRMQErrorResponse;
