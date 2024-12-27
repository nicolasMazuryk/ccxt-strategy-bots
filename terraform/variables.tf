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

