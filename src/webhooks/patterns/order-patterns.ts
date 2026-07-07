export const ORDER_PATTERNS = {
    // Event patterns for payment events
    PAYMENT_STATUS: "payment.status",

    // Events emitted BY orders-ms, consumed HERE
    ORDER_CANCELLED: "order.cancelled",
} as const;