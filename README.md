# 💳 Payments Microservice (`payments-ms`)

A NestJS microservice responsible for handling payments, subscriptions, Stripe Connect accounts, and access control in a multi-tenant environment.

The service communicates exclusively through RabbitMQ and integrates with Stripe for payment processing, subscription billing, and marketplace onboarding.

---

## 📋 Table of Contents

* Overview
* Architecture
* Features
* Tech Stack
* Getting Started
* Environment Variables
* RabbitMQ Patterns
* Stripe Integration
* Database Entities
* Dependencies
* Development Notes

---

# 🚀 Overview

`payments-ms` manages:

* Customer payments
* Subscription lifecycle
* Stripe Checkout Sessions
* Stripe Connect Express accounts
* Payment methods
* Access validation
* Webhook processing
* Payment analytics and reporting

The service is designed as a pure RabbitMQ microservice and does not expose any public REST API.

---

# 🏗️ Architecture

```text
                   ┌──────────────────┐
                   │   Client Gateway │
                   └────────┬─────────┘
                            │ RabbitMQ
                            ▼

┌─────────────────────────────────────────────┐
│                payments-ms                  │
├─────────────────────────────────────────────┤
│ Payments                                    │
│ Subscriptions                               │
│ Stripe Checkout                             │
│ Stripe Connect                              │
│ Webhook Processing                          │
│ Access Control                              │
└──────┬───────────────┬───────────────┬──────┘
       │               │               │
       ▼               ▼               ▼
 PostgreSQL         Redis         Stripe API
```

---

# ✨ Features

* Stripe Checkout integration
* Subscription management
* Stripe Connect Express onboarding
* Payment tracking
* POS payment methods
* Access validation
* RabbitMQ event-driven communication
* Redis idempotency protection
* Multi-tenant support
* Cash-session reporting
* Payment analytics

---

# 🛠 Tech Stack

| Category       | Technology      |
| -------------- | --------------- |
| Framework      | NestJS 11       |
| Language       | TypeScript 5    |
| Database       | PostgreSQL      |
| ORM            | TypeORM 0.3     |
| Messaging      | RabbitMQ        |
| Cache          | Redis           |
| Payments       | Stripe          |
| Validation     | class-validator |
| Env Validation | Zod             |
| Testing        | Jest            |

---

# ⚙️ Getting Started

## Prerequisites

* Node.js 20+
* PostgreSQL
* RabbitMQ
* Redis
* Stripe Account

## Installation

```bash
npm install

cp .env.example .env

npm run start:dev
```

## Available Scripts

```bash
npm run build
npm run start
npm run start:dev
npm run start:prod
npm run start:debug

npm run lint
npm run format

npm run test
npm run test:watch
npm run test:cov
```

---

# 🌍 Environment Variables

| Variable                           | Required | Description                |
| ---------------------------------- | -------- | -------------------------- |
| NODE_ENV                           | ✅        | Environment                |
| PORT                               | ❌        | Service port               |
| DB_HOST                            | ✅        | PostgreSQL host            |
| DB_PORT                            | ❌        | PostgreSQL port            |
| POSTGRES_USER                      | ✅        | Database user              |
| POSTGRES_PASSWORD                  | ✅        | Database password          |
| POSTGRES_DB                        | ✅        | Database name              |
| RABBITMQ_URL                       | ✅        | RabbitMQ connection string |
| RABBITMQ_QUEUE                     | ✅        | RPC queue                  |
| RABBITMQ_QUEUE_EVENTS_PAYMENTS     | ✅        | Events queue               |
| RABBITMQ_QUEUE_EVENTS_ORDERS       | ✅        | Orders queue               |
| RABBITMQ_QUEUE_EVENTS_ORGANIZATION | ✅        | Organization queue         |
| CLIENT_URL                         | ✅        | Frontend URL               |
| STRIPE_SECRET                      | ✅        | Stripe API key             |
| STRIPE_PRICE_ID_BASIC              | ✅        | Basic plan price ID        |
| STRIPE_PRICE_ID_PRO                | ✅        | Pro plan price ID          |
| REDIS_HOST                         | ✅        | Redis host                 |
| REDIS_PORT                         | ❌        | Redis port                 |
| REDIS_PASS                         | ✅        | Redis password             |

---

# 📨 RabbitMQ Patterns

## Payments

| Pattern                        | Description             |
| ------------------------------ | ----------------------- |
| payment.session.create.payment | Create checkout session |
| payment.create.payment         | Create payment          |
| payment.find_all               | List payments           |
| payment.find_my                | User payments           |
| payment.get_by_id              | Get payment             |
| payment.update                 | Update payment          |
| payment.cancel                 | Cancel payment          |
| payment.totals_by_method       | Totals by method        |
| payment.totals_by_method_range | Totals by date range    |

---

## Subscriptions

| Pattern                                | Description         |
| -------------------------------------- | ------------------- |
| subscription.session.create.onboarding | Start onboarding    |
| subscription.get_plans                 | Available plans     |
| subscription.get_by_user               | User subscription   |
| subscription.get_my_history            | Billing history     |
| subscription.change_plan               | Change plan         |
| subscription.cancel                    | Cancel subscription |
| subscription.resume                    | Resume subscription |

---

## Payment Methods

| Pattern                   | Description   |
| ------------------------- | ------------- |
| payment-method.create     | Create method |
| payment-method.findAll    | List methods  |
| payment-method.findOne    | Get method    |
| payment-method.update     | Update method |
| payment-method.softDelete | Soft delete   |
| payment-method.restore    | Restore       |

---

## Access Control

| Pattern                 | Description           |
| ----------------------- | --------------------- |
| access.check            | Subscription status   |
| access.check_onboarding | Onboarding validation |

---

## Stripe Connect

| Pattern                | Description                       |
| ---------------------- | --------------------------------- |
| stripe.connect.account | Create or recover Express account |

---

## Webhooks

| Pattern         | Description           |
| --------------- | --------------------- |
| payment.webhook | Process Stripe events |

---

# 💰 Stripe Integration

## Supported Features

### Checkout Sessions

* One-time payments
* Subscription payments

### Subscriptions

* Upgrade plans
* Downgrade plans
* Cancel subscriptions
* Resume subscriptions
* Invoice history

### Stripe Connect

* Express accounts
* Onboarding links
* Account recovery
* Marketplace payments

---

## Stripe Payment Flow

```text
Customer
    │
    ▼
Checkout Session
    │
    ▼
Stripe Payment
    │
    ▼
Webhook Event
    │
    ▼
payments-ms
    │
    ▼
orders-ms
```

---

## Supported Webhook Events

* checkout.session.completed
* checkout.session.expired
* invoice.paid
* invoice.payment_failed
* customer.subscription.updated
* customer.subscription.deleted
* payment_intent.succeeded
* payment_intent.payment_failed
* payment_intent.canceled
* account.updated
* account.application.deauthorized

---

## Idempotency

Webhook events are protected using Redis locks:

```text
stripe:evt:lock:<eventId>
stripe:evt:done:<eventId>
```

TTL: 72 hours

---

# 🗄 Database Entities

## Payment

Represents a customer payment.

Main fields:

* organizationId
* orderId
* subscriptionId
* amount
* currency
* status
* provider
* externalPaymentId
* externalSessionId
* paidAt
* cancelledAt

---

## Subscription

Represents a customer subscription.

Main fields:

* userId
* plan
* status
* stripeSubscriptionId
* currentPeriodStart
* currentPeriodEnd
* cancelAtPeriodEnd
* priceAmount

Supported plans:

* BASIC
* PRO

---

## PaymentMethod

Represents a POS payment method.

Examples:

* Cash
* Card
* Voucher
* Gift Card

Main fields:

* organizationId
* name
* icon
* isCash
* isDefault
* isSystem
* isActive

---

# 🔗 External Dependencies

## PostgreSQL

Stores:

* Payments
* Subscriptions
* Payment Methods

---

## RabbitMQ

Handles:

* RPC communication
* Event-driven communication
* Service integration

Connected services:

* orders-ms
* organization-ms
* auth-ms
* client-gateway

---

## Redis

Used for:

* Webhook idempotency
* Cache invalidation

---

## Stripe

Used for:

* Checkout Sessions
* Subscriptions
* Invoices
* Stripe Connect

---

# ⚠️ Development Notes

## Current Limitations

### Refunds

Refund processing is not implemented yet.

Current behavior:

* Marks payments as cancelled
* Does not call `stripe.refunds.create()`

### PayPal

PayPal provider is not implemented.

Only Stripe is currently supported.

### Webhook Gateway

Stripe signature verification is performed outside this service.

Webhook events are received through RabbitMQ after validation by another service.

---

# 📈 Service Scope

This service handles both:

### SaaS Billing

* Subscription plans
* Customer onboarding
* Access control

### POS Payments

* Order payments
* Payment methods
* Cash reporting
* Payment analytics

This makes `payments-ms` the central payment platform for the entire ecosystem.
