<div align="center">
  <img src="assets/trpc-rabbitmq-readme.png?v=2" alt="trpc-rabbitmq" />
  <h1>trpc-rabbitmq</h1>
  <a href="https://www.npmjs.com/package/trpc-rabbitmq"><img src="https://img.shields.io/npm/v/trpc-rabbitmq.svg?style=flat&color=brightgreen" target="_blank" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-black" /></a>
  <br />
  <hr />
</div>


## Usage

**1. Install `trpc-rabbitmq`.**

```bash
# npm
npm install trpc-rabbitmq
# yarn
yarn add trpc-rabbitmq
# pnpm
pnpm add trpc-rabbitmq
```

**2. Use `rmqLink` in your client code.**

```typescript
import { createTRPCProxyClient } from '@trpc/client';
import { rmqLink } from 'trpc-rabbitmq/link';

import type { AppRouter } from './appRouter';

export const trpc = createTRPCProxyClient<AppRouter>({
  links: [
    rmqLink({
      url: "amqp://localhost",
      queue: "app"
    })
  ],
});
```

**3. Use `createRMQHandler` to handle incoming calls via RabbitMQ on the server.**

```typescript
import { createRMQHandler } from 'trpc-rabbitmq/adapter';

import { appRouter } from './appRouter';

createRMQHandler({ 
  url: "amqp://localhost",
  queue: "app",
  router: appRouter
});
```

## License

Distributed under the MIT License. See LICENSE for more information.