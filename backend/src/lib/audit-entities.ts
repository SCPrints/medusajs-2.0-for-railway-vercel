/**
 * Canonical vocabulary for the polymorphic `audit_log` table
 * (`backend/src/modules/admin-workspace/models/audit-log.ts`).
 *
 * The model stores `entity` and `action` as freeform `text`, but every
 * call site MUST go through `writeAudit()` (see `./audit-log.ts`) which
 * accepts these typed constants. Adding a new audit source = add to
 * the union here; subscribers/routes can't drift on naming.
 */

export const AUDIT_ENTITY = {
  CUSTOMER: "customer",
  ORDER: "order",
  QUOTE: "quote",
  ORGANISATION: "organisation",
  TASK: "task",
  PRODUCT: "product",
  // Phase 1 of the customer fulfillment service. See Docs/FULFILLMENT_PHASE_1_SPEC.md.
  ORGANISATION_DESIGN: "organisation_design",
  ORGANISATION_DESTINATION: "organisation_destination",
  ORG_INVENTORY: "org_inventory",
} as const
export type AuditEntity = (typeof AUDIT_ENTITY)[keyof typeof AUDIT_ENTITY]

export const AUDIT_ACTION = {
  // Lifecycle
  CREATED: "created",
  DELETED: "deleted",
  STATUS_CHANGED: "status_changed",
  STAGE_CHANGED: "stage_changed",
  CONVERTED: "converted",
  EXPIRED: "expired",
  // Assignment
  ASSIGNED: "assigned",
  UNASSIGNED: "unassigned",
  OWNER_CHANGED: "owner_changed",
  // Workflow
  WATCHER_ADDED: "watcher_added",
  WATCHER_REMOVED: "watcher_removed",
  RULE_FIRED: "rule_fired",
  // Customer-side
  TAG_ADDED: "tag_added",
  TAG_REMOVED: "tag_removed",
  NOTE_ADDED: "note_added",
  NOTE_PINNED: "note_pinned",
  NOTE_SNOOZED: "note_snoozed",
  NOTE_DELETED: "note_deleted",
  COMMENT_POSTED: "comment_posted",
  CONSENT_CHANGED: "consent_changed",
  // Organisation
  MEMBER_ADDED: "member_added",
  MEMBER_REMOVED: "member_removed",
  // Email side-channels (Phase 8/9 — defined now so the constant is stable)
  EMAIL_SENT: "email_sent",
  EMAIL_OPENED: "email_opened",
  EMAIL_CLICKED: "email_clicked",
  EMAIL_BOUNCED: "email_bounced",
  EMAIL_SUPPRESSED: "email_suppressed",
  PAYMENT_LINK_CLICKED: "payment_link_clicked",
  // Product bulk edits (Products Manager tab in /app/product-data)
  BULK_STATUS_CHANGED: "bulk_status_changed",
  BULK_DELETED: "bulk_deleted",
  BULK_BRAND_CHANGED: "bulk_brand_changed",
  BULK_TYPE_CHANGED: "bulk_type_changed",
  BULK_TAGS_CHANGED: "bulk_tags_changed",
  BULK_SALES_CHANNELS_CHANGED: "bulk_sales_channels_changed",
  BULK_CATEGORIES_CHANGED: "bulk_categories_changed",
  BULK_COLLECTION_CHANGED: "bulk_collection_changed",
  BULK_PRINT_PROFILE_CHANGED: "bulk_print_profile_changed",
  // Phase 1 of the customer fulfillment service.
  STOCK_RESERVED: "stock_reserved",
  STOCK_SHIPPED: "stock_shipped",
  STOCK_RELEASED: "stock_released",
  STOCK_RECEIVED: "stock_received",
  STOCK_ADJUSTED_UP: "stock_adjusted_up",
  STOCK_ADJUSTED_DOWN: "stock_adjusted_down",
  FULFILLMENT_ORDER_CREATED: "fulfillment_order_created",
  FULFILLMENT_ORDER_CANCELLED: "fulfillment_order_cancelled",
  DESIGN_CREATED: "design_created",
  DESIGN_UPDATED: "design_updated",
  DESIGN_DEACTIVATED: "design_deactivated",
  DESTINATION_CREATED: "destination_created",
  DESTINATION_UPDATED: "destination_updated",
  DESTINATION_DEACTIVATED: "destination_deactivated",
  INVENTORY_ROW_CREATED: "inventory_row_created",
  INVENTORY_ROW_UPDATED: "inventory_row_updated",
  INVENTORY_ROW_DEACTIVATED: "inventory_row_deactivated",
  ORGANISATION_PRIMARY_CONTACT_SET: "organisation_primary_contact_set",
} as const
export type AuditAction = (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION]
