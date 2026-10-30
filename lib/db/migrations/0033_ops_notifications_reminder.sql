ALTER TABLE "ops_notifications" DROP CONSTRAINT "ops_notifications_kind_check";
--> statement-breakpoint
ALTER TABLE "ops_notifications" ADD CONSTRAINT "ops_notifications_kind_check" CHECK ("ops_notifications"."kind" IN ('new_request', 'daily_summary', 'test', 'review_request', 'block_alert', 'reply', 'returned', 'digest', 'reminder'));
