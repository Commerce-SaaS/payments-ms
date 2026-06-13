import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { UserContext } from 'src/common/dto/current-user-context.type';
import { RpcExceptionHelper } from 'src/common/helpers/rpc-exception.helper';
import { ORGANIZATION_EVENTS_CLIENT, STRIPE_CLIENT } from 'src/config/services';
import Stripe from 'stripe';
import { StripeConnectErrorCode } from './enums/subscription-error-code.enum';
import { envs } from 'src/config';
import { ORGANIZATION_PATTERNS } from './patterns/organization_patterns';

@Injectable()
export class StripeConnectService {
  private readonly logger = new Logger(StripeConnectService.name);

  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripeClient: Stripe,
    @Inject(ORGANIZATION_EVENTS_CLIENT)
    private readonly organizationEventsClient: ClientProxy,
  ) {}

  async connectAccount(user: UserContext) {
    try {
      let { stripeAccountId, email, organizationId } = user;

      // ─── 1. Resolver stripeAccountId ──────────────────────────────
      if (!stripeAccountId) {
        const recovered = await this.recoverStripeAccount(organizationId);

        if (recovered) {
          stripeAccountId = recovered;
          this.logger.log(
            `Recovered Stripe account ${stripeAccountId} for organization=${organizationId}`,
          );

          this.organizationEventsClient.emit(ORGANIZATION_PATTERNS.UPDATE_EVENT, {
            id: organizationId,
            stripeAccountId,
          });

        } else {
          const account = await this.stripeClient.accounts.create({
            type:          'express',
            email,
            capabilities: {
              card_payments: { requested: true },
              transfers:     { requested: true },
            },
            business_type: 'individual',
            metadata:      { organizationId },
          });

          stripeAccountId = account.id;

          this.organizationEventsClient.emit(ORGANIZATION_PATTERNS.UPDATE_EVENT, {
            id: organizationId,
            stripeAccountId,
          });

          this.logger.log(
            `Created Stripe account ${stripeAccountId} for organization=${organizationId}`,
          );
        }
      }

      // ─── 2. Recuperar cuenta y asegurar metadata ──────────────────
      const account = await this.stripeClient.accounts.retrieve(stripeAccountId);

      // Actualizar metadata si la cuenta no tiene organizationId
      // (cuentas creadas antes de implementar el backup en metadata)
      if (!account.metadata?.organizationId) {
        this.logger.log(
          `Updating metadata for account=${stripeAccountId} with organizationId=${organizationId}`,
        );
        await this.stripeClient.accounts.update(stripeAccountId, {
          metadata: { organizationId },
        });
      }

      // ─── 3. Verificar estado real de la cuenta ────────────────────
      const isFullyOnboarded = account.charges_enabled && account.payouts_enabled;

      if (isFullyOnboarded) {
        this.logger.log(
          `Stripe account ${stripeAccountId} is fully onboarded`,
        );
        return {
          onboardingUrl: null,
          accountId:     stripeAccountId,
          status:        'complete',
        };
      }

      // ─── 4. Generar link de onboarding ────────────────────────────
      const accountLink = await this.stripeClient.accountLinks.create({
        account:     stripeAccountId,
        refresh_url: `${envs.clientUrl}/stripe/refresh`,
        return_url:  `${envs.clientUrl}/stripe/success`,
        type:        'account_onboarding',
      });

      this.logger.log(
        `Onboarding link created for account=${stripeAccountId}`,
      );

      return {
        onboardingUrl: accountLink.url,
        accountId:     stripeAccountId,
        status:        'pending',
      };

    } catch (error: any) {
      if (error instanceof Stripe.errors.StripeError) {
        RpcExceptionHelper.badRequest(
          StripeConnectErrorCode.STRIPE_API_ERROR,
          `Stripe error: ${error.message}`,
        );
      }

      RpcExceptionHelper.internal(
        StripeConnectErrorCode.INTERNAL_SERVER_ERROR,
        `Unexpected error connecting Stripe account: ${error.message}`,
      );
    }
  }

  // ─── Recuperar cuenta por organizationId en metadata de Stripe ───

  private async recoverStripeAccount(organizationId: string): Promise<string | null> {
    this.logger.log(
      `Searching for existing Stripe account for organization=${organizationId}`,
    );

    try {
      let hasMore      = true;
      let startingAfter: string | undefined;

      while (hasMore) {
        const accounts = await this.stripeClient.accounts.list({
          limit: 100,
          ...(startingAfter && { starting_after: startingAfter }),
        });

        const existing = accounts.data.find(
          (acc) => acc.metadata?.organizationId === organizationId,
        );

        if (existing) {
          this.logger.log(
            `Found existing Stripe account ${existing.id} for organization=${organizationId}`,
          );
          return existing.id;
        }

        hasMore = accounts.has_more;
        if (hasMore && accounts.data.length > 0) {
          startingAfter = accounts.data[accounts.data.length - 1].id;
        }
      }

      return null;

    } catch (error: any) {
      this.logger.warn(
        `Failed to search Stripe accounts for organization=${organizationId}: ${error.message}`,
      );
      return null;
    }
  }
}