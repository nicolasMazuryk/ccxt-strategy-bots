variable "aws_region" {
  type        = string
  default     = "eu-central-1"
  description = "AWS region where resources will be created"
}

variable "aws_account_id" {
  type        = string
  default     = ""
  description = "AWS account ID"
}

variable "slack_webhook_url" {
  type        = string
  default     = ""
  description = "Slack webhook URL for notifications"
}
