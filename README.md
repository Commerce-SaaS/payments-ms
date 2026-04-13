# 🧩 Payments Microservice

A production-ready NestJS microservice responsible for managing payments, subscriptions, and access control within a SaaS platform. This service acts as the backbone for all financial transactions and subscription management, integrating with Stripe as the primary payment processor and communicating with other microservices via RabbitMQ.

## 🏗️ Architecture

This microservice follows a **modular, event-driven architecture** with clear separation of concerns:

- **RPC Pattern**: Synchronous communication via RabbitMQ for payment and subscription operations
- **Event Pattern**: Asynchronous event handling for webhooks and subscription lifecycle events
- **Provider Strategy Pattern**: Flexible payment provider abstraction (Stripe currently implemented, PayPal ready)
- **Entity-Service-Controller**: Standard NestJS layered architecture for each domain module
- **Global Modules**: Payment and Stripe modules marked as `@Global()` for service-wide availability

**Key Design Principles:**
- Separation of payment, subscription, and access concerns into independent modules
- Factory pattern for extensible payment provider support
- Webhook handler delegation for maintainability
- Database-backed state management for audit trails and reliability

## ⚙️ Tech Stack

- **Framework**: NestJS 11.x
- **Language**: TypeScript 5.7+
- **Database**: PostgreSQL 13+ with TypeORM 0.3
- **Message Queue**: RabbitMQ (AMQP Protocol)
- **Payment Processor**: Stripe SDK 20.1.0
- **Validation**: class-validator & class-transformer
- **Caching**: Redis (ioredis 5.8.2)
- **Configuration**: Zod for environment schema validation
- **Testing**: Jest 29.7.0

## 📁 Project Structure

```
src/
├── app.module.ts                 # Root application module
├── main.ts                       # Application entry point & microservice setup
├── payment/                      # Core payment processing module
│   ├── payment.controller.ts     # RabbitMQ message handlers for payments
│   ├── payment.service.ts        # Business logic for payment operations
│   ├── payment.module.ts         # Module configuration (Global)
│   ├── entities/
│   │   └── payment.entity.ts     # Payment entity with ORM mapping
│   ├── enums/
│   │   ├── payment-status.enum.ts       # Payment lifecycle states
│   │   ├── payment-provider.enum.ts     # Supported providers (Stripe, PayPal)
│   │   ├── payment-error-code.enum.ts   # Error codes for payments
│   │   └── payment-type.enum.ts         # Payment classification
│   ├── dto/
│   │   ├── create-payment-session.dto.ts  # Session creation request
│   │   ├── create-payment.dto.ts          # Payment creation request
│   │   ├── create-subscription-session.dto.ts  # Subscription session request
│   │   └── update-payment.dto.ts          # Payment update request
│   └── patterns/
│       └── payment_patterns.ts   # RabbitMQ routing patterns
├── subscription/                 # Subscription lifecycle management module
│   ├── subscription.controller.ts   # RabbitMQ message handlers
│   ├── subscription.service.ts      # Business logic for subscriptions
│   ├── subscription.module.ts       # Module configuration
│   ├── entities/
│   │   └── subscription.entity.ts   # Subscription entity with plan/status
│   ├── enums/
│   │   ├── subscription-status.enum.ts    # Subscription states (Trial, Active, etc.)
│   │   ├── subscription-plan.enum.ts      # Available plans (Free, Basic, Pro)
│   │   └── subscription-error-code.enum.ts
│   ├── dto/
│   │   ├── create-subscription.dto.ts     # Subscription creation request
│   │   └── update-subscription.dto.ts     # Subscription update request
│   └── patterns/
│       └── suscription_patterns.ts  # RabbitMQ routing patterns
├── webhooks/                     # Stripe webhook event handling module
│   ├── webhooks.controller.ts       # RabbitMQ event listeners
│   ├── webhooks.service.ts          # Webhook orchestration logic
│   ├── webhooks.module.ts           # Module configuration
│   ├── handlers/
│   │   ├── payment.handler.ts       # Payment event handlers
│   │   ├── subscription.handler.ts  # Subscription event handlers
│   │   └── connect.handler.ts       # Stripe Connect account handlers
│   ├── types/
│   │   ├── webhook-events.types.ts  # Webhook event interfaces
│   │   └── invoice-metadata.types.ts
│   ├── patterns/
│   │   ├── webhook_patterns.ts      # RabbitMQ webhook patterns
│   │   └── organization_patterns.ts # Organization-related patterns
│   └── dto/
│       └── create-webhook.dto.ts    # Webhook payload DTOs
├── access/                       # Access control & authorization module
│   ├── access.controller.ts         # RabbitMQ access check handlers
│   ├── access.service.ts            # Access validation logic
│   ├── access.module.ts             # Module configuration
│   └── dto/
│       ├── create-access.dto.ts     # Access check request
│       ├── update-access.dto.ts     # Access update request
│       └── patterns/
│           └── access_patterns.ts   # RabbitMQ access patterns
├── providers/                    # Payment provider abstraction layer
│   ├── payment-provider.factory.ts   # Factory for provider strategy selection
│   └── strategies/
│       ├── payment-provider.strategy.ts  # Strategy interface definition
│       ├── stripe.strategy.ts           # Stripe implementation
│       └── interfaces/
│           ├── create-provider-session.interface.ts
│           └── provider-session-result.interface.ts
├── stripe/                       # Stripe SDK provider & dependency injection
│   └── stripe.module.ts          # Stripe client factory & exports
├── config/                       # Application configuration
│   ├── envs.ts                   # Environment schema validation (Zod)
│   ├── index.ts                  # Config exports
│   ├── services.ts               # DI token constants
│   └── transports/
│       └── rabbitmq.module.ts    # RabbitMQ transport configuration
└── common/                       # Shared utilities & helpers
    └── helpers/
        └── rpc-exception.helper.ts  # RPC error handling utilities
```

## 🔌 Environment Variables

All environment variables are validated using Zod schema. Required variables must be set before application startup:

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `NODE_ENV` | `development\|production\|test` | - | Application environment mode |
| `PORT` | Number | 3000 | Microservice HTTP/TCP port (for metrics, health checks) |
| **Database Configuration** |
| `DB_HOST` | String | - | PostgreSQL server hostname |
| `DB_PORT` | Number | 5432 | PostgreSQL server port |
| `POSTGRES_USER` | String | - | PostgreSQL database username |
| `POSTGRES_PASSWORD` | String | - | PostgreSQL database password |
| `POSTGRES_DB` | String | - | PostgreSQL database name |
| **RabbitMQ Configuration** |
| `RABBITMQ_URL` | String | - | RabbitMQ connection URL (format: `amqp://user:pass@host:port` or `amqps://...`) |
| `RABBITMQ_QUEUE` | String | - | Primary RPC queue name for payment requests |
| `RABBITMQ_QUEUE_EVENTS_PAYMENTS` | String | - | Event queue name for payment system events |
| **External Services** |
| `CLIENT_URL` | URL | - | Frontend/Client application base URL (used for Stripe redirect URLs) |
| `STRIPE_SECRET` | String | - | Stripe API Secret Key for backend operations |
| **Caching** |
| `REDIS_HOST` | String | - | Redis server hostname |
| `REDIS_PORT` | Number | 6379 | Redis server port |

### Example `.env` file:
```bash
NODE_ENV=development
PORT=3001
DB_HOST=localhost
DB_PORT=5432
POSTGRES_USER=payments_user
POSTGRES_PASSWORD=secure_password
POSTGRES_DB=payments_db
RABBITMQ_URL=amqp://guest:guest@localhost:5672
RABBITMQ_QUEUE=payment.rpc
RABBITMQ_QUEUE_EVENTS_PAYMENTS=payment.events
CLIENT_URL=http://localhost:3000
STRIPE_SECRET=sk_test_your_stripe_secret_key
REDIS_HOST=localhost
REDIS_PORT=6379
```

## 🚀 Installation & Running

### Prerequisites
- Node.js 18+
- npm or yarn
- Docker (optional, for running PostgreSQL and RabbitMQ locally)

### Installation

1. **Clone and install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start external services** (PostgreSQL, RabbitMQ)
   ```bash
   # Using Docker Compose (if available)
   docker-compose up -d

   # Or start them individually with Docker
   docker run -d --name postgres_payments \
     -e POSTGRES_USER=payments_user \
     -e POSTGRES_PASSWORD=secure_password \
     -e POSTGRES_DB=payments_db \
     -p 5432:5432 \
     postgres:15

   docker run -d --name rabbitmq_payments \
     -p 5672:5672 \
     -p 15672:15672 \
     rabbitmq:3.12-management
   ```

### Running the Service

**Development Mode** (with auto-reload)
```bash
npm run start:dev
```

**Production Mode**
```bash
npm run build
npm run start:prod
```

**Debug Mode** (with debugger support)
```bash
npm run start:debug
```

The microservice will:
1. Connect to PostgreSQL and synchronize entities (in development)
2. Connect to RabbitMQ and establish two message listener queues
3. Initialize all modules and providers
4. Start listening on the configured `PORT`

**Expected startup output:**
```
[Bootstrap] Microservice is starting...
[TypeOrmModule] Database connected successfully
[RabbitMQ] Connected to RabbitMQ
[NestFactory] Application launched successfully
```

## 📡 API Endpoints

This is a **message-driven microservice** that communicates exclusively via RabbitMQ patterns (not HTTP). All interactions follow the Request-Reply or Event pattern.

### Payment Patterns

| Pattern | Type | Request Payload | Response | Description |
|---------|------|-----------------|----------|-------------|
| `payment.session.create.payment` | RPC (MessagePattern) | `CreatePaymentSessionDto` | `{ paymentId: UUID, checkoutUrl: string }` | Create a Stripe payment checkout session |
| `payment.get_by_id` | RPC (MessagePattern) | `{ id: UUID }` | `Payment Entity` | Retrieve payment by ID (Not detected in controller, but in patterns) |
| `payment.webhook.stripe` | RPC (MessagePattern) | Stripe webhook | - | Process Stripe payment webhooks (Not detected in controller) |
| `payment.webhook.paypal` | RPC (MessagePattern) | PayPal webhook | - | Process PayPal webhooks (Not detected in controller) |
| `payment.confirm` | RPC (MessagePattern) | Payment data | - | Confirm payment completion (Not detected in controller) |
| `payment.fail` | RPC (MessagePattern) | Failure data | - | Mark payment as failed (Not detected in controller) |
| `payment.refund` | RPC (MessagePattern) | Refund request | - | Process payment refund (Not detected in controller) |

### Subscription Patterns

| Pattern | Type | Request Payload | Response | Description |
|---------|------|-----------------|----------|-------------|
| `payment.session.create.subscription` | RPC (MessagePattern) | `CreateSubscriptionSessionDto` | `{ paymentId: UUID, checkoutUrl: string }` | Create subscription checkout session |
| `subscription.create_trial` | Event (EventPattern) | `CreateSubscriptionDto` | void | Create trial subscription for organization |
| `subscription.get_by_org` | RPC (MessagePattern) | `{ organizationId: UUID }` | `Subscription Entity` | Get subscription by organization |
| `subscription.change_plan` | RPC (MessagePattern) | `{ id: UUID, plan: SubscriptionPlan }` | `Subscription Entity` | Change subscription plan |
| `subscription.cancel` | RPC (MessagePattern) | `{ id: UUID }` | `Subscription Entity` | Cancel subscription |

### Access Control Patterns

| Pattern | Type | Request Payload | Response | Description |
|---------|------|-----------------|----------|-------------|
| `access.check` | RPC (MessagePattern) | `{ organizationId: UUID }` | `{ active: boolean, plan: SubscriptionPlan, expiresAt: Date }` | Check organization access permissions |

### Webhook Event Patterns

| Pattern | Type | Event Source | Payload | Description |
|---------|------|--------------|---------|-------------|
| `payment.webhook` | Event (EventPattern) | External (Stripe) | `WebhookEvent` | Listen for incoming webhook events |

**Webhook Event Types Handled** (from Stripe):
- `checkout.session.completed` - Payment session completed
- `invoice.paid` - Subscription invoice paid
- `invoice.payment_failed` - Subscription payment failed
- `customer.subscription.deleted` - Subscription canceled
- `payment_intent.succeeded` - Payment succeeded
- `payment_intent.payment_failed` - Payment failed
- `payment_intent.canceled` - Payment canceled
- `account.updated` - Stripe Connect account updated
- `account.application.deauthorized` - Connect account deauthorized
- `account.external_account.created` - Bank account added
- `account.external_account.deleted` - Bank account removed

### Request/Response Models

#### CreatePaymentSessionDto
```typescript
{
  orderId: string (UUID),              // Order identifier
  userId: string (UUID),               // User initiating payment
  amount: number (positive),           // Amount in cents
  provider: "stripe" | "paypal",       // Payment provider
  organizationId: string (UUID),       // Organization making payment
  stripeAccountId: string,             // Stripe Connect account ID
  lineItems: LineItem[],               // Checkout line items
    ├─ price_data: {
    │   ├─ currency: string,           // ISO currency code (e.g., "eur")
    │   ├─ unit_amount: number,        // Price in units
    │   └─ product_data: {
    │       └─ name: string            // Product name
    │   }
    │ }
    └─ quantity: number                // Item quantity
}
```

#### CreateSubscriptionSessionDto
```typescript
{
  subscriptionId: string (UUID),       // Subscription being upgraded
  organizationId: string (UUID),       // Organization
  priceId: string,                    // Stripe Price ID
  userId: string (UUID),              // User initiating
  provider: "stripe" | "paypal"       // Payment provider
}
```

## 🔐 Security

### Authentication & Authorization
- **Microservice-to-Microservice**: Communication via RabbitMQ with trusted internal network (no token validation required)
- **Webhook Verification**: Stripe webhooks validated against Stripe signature headers (Stripe SDK handles verification)
- **Access Control**: `AccessModule` validates organization subscription status before granting access to protected resources

### Data Validation
- **Input Validation**: All DTOs validated using `class-validator` decorators
- **Global Validation Pipe**: Enabled with strict configuration:
  - `whitelist: true` - Strip unknown properties
  - `forbidNonWhitelisted: true` - Reject requests with unknown properties
  - `transform: true` - Auto-transform request to DTO class
  - Custom `exceptionFactory` - Returns RPC exceptions for microservice compatibility

### Error Handling
- **RpcExceptionHelper**: Centralized error handling utility
  - Converts database errors to specific error codes
  - Returns HTTP-compliant status codes in RPC exceptions
  - Handles: duplicate entries (409), not found (404), internal errors (500), forbidden (403)
  - Detects PostgreSQL violation codes (e.g., 23505 for unique constraint)

### Database Security
- **Indexed Queries**: Payment and Subscription entities have strategic indexes for performance:
  - Payment: `orderId`, `subscriptionId`, `externalPaymentId`, `externalSessionId`
  - Subscription: `organizationId` (unique constraint)
- **Entity Synchronization**: Only enabled in development (`synchronize: true` when `NODE_ENV === 'development'`)
- **Auto-loading Entities**: TypeORM configured for automatic entity discovery

### Secrets Management
- **Stripe API Key**: Never logged or exposed; stored as `STRIPE_SECRET` environment variable
- **Database Credentials**: Never hardcoded; loaded from environment (Zod validates presence)

## 🧠 Core Logic

### Payment Flow
1. **Session Creation** (`payment.session.create.payment`):
   - Receives `CreatePaymentSessionDto` with order/subscription details
   - Checks for existing pending payments to prevent duplicates
   - Creates `Payment` entity record with `PENDING` status
   - Delegates to provider strategy (Stripe) to create checkout session
   - Returns checkout URL and payment ID to client

2. **Payment State Machine**:
   - `PENDING` → `PROCESSING` (checkout completed)
   - `PROCESSING` → `COMPLETED` (payment succeeded)
   - `PENDING/PROCESSING` → `FAILED` (payment failed)
   - `COMPLETED` → `REFUNDED` (refund processed)

3. **Provider Abstraction**:
   - `PaymentProviderFactory` routes to appropriate strategy
   - `StripeStrategy` implements Stripe-specific session creation
   - Metadata attached for order/subscription tracking
   - Support for platform splits via `stripeAccountId` (Stripe Connect)

### Subscription Lifecycle
1. **Trial Creation** (`subscription.create_trial`):
   - Triggered when new organization signs up
   - Creates subscription with `FREE` plan and `TRIAL` status
   - Trial period: 14 days auto-calculated
   - Prevents duplicate subscriptions via unique index on `organizationId`

2. **Plan Upgrade** (`subscription.change_plan`):
   - Changes subscription plan (FREE → BASIC → PRO)
   - Initiates checkout session for recurring billing
   - Strategy same as payment sessions but with `mode: 'subscription'`

3. **Subscription Payment** (`invoice.paid` webhook):
   - Triggered by Stripe after successful subscription charge
   - Updates subscription status to `ACTIVE`
   - Handles `invoice.payment_failed` for handling declined payments

4. **Cancellation** (`subscription.cancel`):
   - Sets status to `CANCELED`
   - Triggers Stripe subscription deletion via webhook
   - `customer.subscription.deleted` event confirms cancellation

### Access Control Logic
1. **Check Access** (`access.check`):
   - Queries subscription for organization
   - Validates subscription status (ACTIVE = true, others = false)
   - Returns current plan and expiration date
   - Used by other microservices to enforce feature gates

### Webhook Processing Pipeline
1. **Event Reception** (`payment.webhook` event):
   - RabbitMQ listener receives Stripe event
   - Route on `event.type` to appropriate handler
   - Handlers update Payment/Subscription state in database

2. **Event Delegation**:
   - **ConnectHandler**: Stripe Connect account lifecycle (account updates, deauthorizations)
   - **PaymentHandler**: Payment intent events (succeeded, failed, canceled)
   - **SubscriptionHandler**: Subscription/invoice events (paid, payment failed, deleted)

## 🔄 Integrations

### External Services

#### Stripe Payment Processor
- **SDK Version**: stripe 20.1.0
- **API Version**: 2025-12-15.clover
- **Use Cases**:
  - Checkout session creation for payments and subscriptions
  - Price/product data retrieval for subscriptions
  - Webhook event handling for payment/subscription state changes
  - Stripe Connect for marketplace payment splits
- **Authentication**: Via `STRIPE_SECRET` API key
- **Key Methods**:
  - `stripe.checkout.sessions.create()` - Create payment sessions
  - `stripe.prices.retrieve()` - Get pricing data
  - `stripe.events.*` - Handle webhook events

#### PostgreSQL Database
- **Version**: 13+ recommended
- **ORM**: TypeORM with automatic entity management
- **Entities**: `Payment`, `Subscription`
- **Indexes**: Strategic indexes on frequently queried columns
- **Migrations**: Not detected (autoSync enabled in development)

#### RabbitMQ Message Broker
- **Protocol**: AMQP (amqp/amqps)
- **Queues**:
  - RPC Queue (`RABBITMQ_QUEUE`): Synchronous payment operations
  - Event Queue (`RABBITMQ_QUEUE_EVENTS_PAYMENTS`): Event emissions
- **Patterns**: `MessagePattern` for RPC, `EventPattern` for events
- **Reliability**: Durable queues configured
- **Consumers**: External microservices subscribe to payment events

#### Redis Cache
- **Library**: ioredis 5.8.2
- **Purpose**: Not actively used in analyzed code (prepared for future caching layer)

### Microservice Communication Contract

**Upstream Dependencies** (services that call payments-ms):
- Auth microservice: Validates user before payment
- Orders microservice: Triggers payment session creation
- Billing microservice: May query payment status

**Downstream Dependencies** (services payments-ms calls):
- None direct RPC calls; only integrates with Stripe
- Events published for: Order confirmation, billing updates

## 📊 Database Schema

### Payment Entity
```sql
CREATE TABLE payment (
  id UUID PRIMARY KEY,
  organizationId UUID NOT NULL,
  orderId UUID,
  subscriptionId UUID,
  userId UUID,
  amount INT NOT NULL,
  currency VARCHAR (3) DEFAULT 'eur',
  status ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED'),
  provider ENUM ('stripe', 'paypal') NOT NULL,
  externalPaymentId VARCHAR,
  externalSessionId VARCHAR,
  providerMetadata JSON,
  checkoutUrl VARCHAR,
  failureReason VARCHAR,
  paidAt TIMESTAMP,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- Indexes
  INDEX (orderId),
  INDEX (subscriptionId),
  INDEX (externalPaymentId),
  INDEX (externalSessionId)
);
```

### Subscription Entity
```sql
CREATE TABLE subscription (
  id UUID PRIMARY KEY,
  organizationId UUID NOT NULL UNIQUE,
  plan ENUM ('FREE', 'BASIC', 'PRO') NOT NULL,
  status ENUM ('TRIAL', 'PROCESSING', 'ACTIVE', 'PAST_DUE', 'CANCELED'),
  stripeSubscriptionId VARCHAR,
  currentPeriodStart TIMESTAMP,
  currentPeriodEnd TIMESTAMP,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- Indexes
  UNIQUE INDEX (organizationId)
);
```

## 🧪 Testing

### Running Tests
```bash
# Run all tests
npm run test

# Run tests in watch mode (useful during development)
npm run test:watch

# Run tests with coverage report
npm run test:cov

# Run tests in debug mode
npm run test:debug

# Run e2e tests
npm run test:e2e
```

### Test Configuration
- **Framework**: Jest 29.7.0
- **Root Directory**: `src/`
- **Test Files**: `**/*.spec.ts`
- **Coverage Directory**: `coverage/`
- **Test Environment**: Node.js

### Testing Notes
- **Unit Tests**: Test individual services and providers
- **Integration Tests**: Test module initialization and TypeORM queries
- **E2E Tests**: Test RabbitMQ message patterns and webhook handling
- **Test Database**: Recommend separate PostgreSQL instance for testing

## 📌 Additional Notes

### Development Tools & Scripts
```bash
npm run build           # Compile TypeScript to JavaScript
npm run format          # Format code with Prettier
npm run lint            # Run ESLint and fix issues
npm start               # Start microservice (production-ready startup)
```

### Code Quality
- **Linting**: ESLint with TypeScript support
- **Formatting**: Prettier with consistent style
- **Type Safety**: Strict TypeScript mode enabled

### Performance Considerations
- **Database Connection Pooling**: TypeORM handles connection pooling
- **Message Batching**: RabbitMQ can batch multiple messages for efficiency
- **Provider Strategy**: Factory pattern allows for future optimization (e.g., PayPalStrategy)
- **Computed Indexes**: Strategic indexes on Payment/Subscription reduce query times

### Monitoring & Observability
- **Logging**: NestJS built-in Logger (implement structured logging in production)
- **Error Tracking**: Send RPC exceptions to error tracking service (e.g., Sentry)
- **Metrics**: Expose Prometheus metrics endpoint for monitoring queue depth, message latency

### Production Deployment Checklist
- [ ] Set `NODE_ENV=production`
- [ ] Use strong, randomly generated secrets for all environment variables
- [ ] Enable HTTPS for RABBITMQ_URL (use `amqps://`)
- [ ] Set up database backups with point-in-time recovery
- [ ] Implement rate limiting on payment endpoints
- [ ] Configure RabbitMQ cluster for high availability
- [ ] Set up monitoring and alerting for queue depth
- [ ] Test webhook signature validation with production Stripe account
- [ ] Enable database connection pooling in production
- [ ] Configure separate database credentials for read replicas

### Known Limitations & Future Improvements
- **PayPal Integration**: PayPal strategy skeleton exists but not fully implemented
- **Caching Layer**: Redis integration prepared but not actively used
- **Async Processing**: All operations are currently synchronous; consider async/await patterns for webhook processing
- **Event Sourcing**: Payment history not fully audit-logged; consider implementing event sourcing
- **Idempotency**: Add idempotency keys for payment operations to prevent duplicate charges

### Troubleshooting

**RabbitMQ Connection Errors**
- Verify RABBITMQ_URL format starts with `amqp://` or `amqps://`
- Check RabbitMQ server is running: `docker ps | grep rabbitmq`
- Verify credentials and port accessibility

**Database Connection Errors**
- Ensure PostgreSQL is running and accessible
- Check credentials in `.env` file
- Verify database exists: `psql -U postgres -l | grep payments_db`

**Stripe Integration Issues**
- Verify `STRIPE_SECRET` begins with `sk_test_` or `sk_live_`
- Check Stripe API version compatibility in `stripe.module.ts`
- Inspect Stripe dashboard for webhook configuration

---

**Last Updated**: 2026-04-13  
**Microservice Version**: 0.0.1  
