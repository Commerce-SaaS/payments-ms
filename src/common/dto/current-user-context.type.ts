export enum OrganizationRole {
  STAFF = 'staff',
  CUSTOMER = 'customer'
}
export interface UserContext {
  organizationId: string;
  organizationRole: OrganizationRole;
  stripeAccountId: string | null;
  email: string;
}
