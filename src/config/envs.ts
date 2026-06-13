import { z } from 'zod';
import 'dotenv/config';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']),
    PORT: z.coerce.number().default(3000),
    DB_PORT: z.coerce.number().default(5432),
    DB_HOST: z.string(),
    POSTGRES_USER: z.string(),
    POSTGRES_PASSWORD: z.string(),
    POSTGRES_DB: z.string(),
    RABBITMQ_URL: z.string().refine((val) => /^amqps?:\/\//.test(val), {
      message: 'RABBITMQ_URL must start with amqp:// or amqps://',
    }),
    RABBITMQ_QUEUE: z.string().min(1, 'RABBITMQ_QUEUE cannot be empty'),
    RABBITMQ_QUEUE_EVENTS_ORDERS: z.string().min(1, 'RABBITMQ_QUEUE_EVENTS_ORDERS cannot be empty'),
    RABBITMQ_QUEUE_EVENTS_PAYMENTS: z.string().min(1, 'RABBITMQ_QUEUE_EVENTS_PAYMENTS cannot be empty'),
    RABBITMQ_QUEUE_EVENTS_ORGANIZATION: z.string().min(1, 'RABBITMQ_QUEUE_EVENTS_ORGANIZATION cannot be empty'),
    CLIENT_URL: z.string().url('CLIENT_URL must be a valid URL'),
    STRIPE_SECRET: z.string().min(1, 'STRIPE_SECRET cannot be empty'),
    REDIS_HOST: z.string(),
    REDIS_PORT: z.coerce.number().default(6379),
  })
  .required();

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error(
    '❌ Invalid environment variables:',
    parsedEnv.error.flatten().fieldErrors,
  );
  throw new Error('Invalid environment variables');
}

export const envs = {
  nodeEnv: parsedEnv.data.NODE_ENV,
  port: parsedEnv.data.PORT,
  dbPort: parsedEnv.data.DB_PORT,
  dbHost: parsedEnv.data.DB_HOST,
  postgresUser: parsedEnv.data.POSTGRES_USER,
  postgresPassword: parsedEnv.data.POSTGRES_PASSWORD,
  postgresDb: parsedEnv.data.POSTGRES_DB,
  rabbitmqUrl: parsedEnv.data.RABBITMQ_URL,
  rabbitmqQueue: parsedEnv.data.RABBITMQ_QUEUE,
  rabbitmqOrdersEventQueue: parsedEnv.data.RABBITMQ_QUEUE_EVENTS_ORDERS,
  rabbitmqPaymentEventQueue: parsedEnv.data.RABBITMQ_QUEUE_EVENTS_PAYMENTS,
  clientUrl: parsedEnv.data.CLIENT_URL,
  stripeSecret: parsedEnv.data.STRIPE_SECRET,
  redisHost: parsedEnv.data.REDIS_HOST,
  redisPort: parsedEnv.data.REDIS_PORT,
  rabbitmqOrganizationQueue: parsedEnv.data.RABBITMQ_QUEUE_EVENTS_ORGANIZATION,
};
