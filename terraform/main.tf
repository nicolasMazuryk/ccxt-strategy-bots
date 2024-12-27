###############################################################################
# Provider Configuration
###############################################################################
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.82.2" # Use version constraint for flexibility
    }
  }
  required_version = "~> 1.10.3" # Use version constraint for flexibility
}

locals {
  # Common tags to be applied to all resources
  common_tags = {
    Project   = "trading-bots"
    ManagedBy = "terraform"
  }

  # Bot configurations
  bots = {
    grid_bot_spot_stable = {
      cpu      = 256
      memory   = 512
      bot_mode = "SPOT"
    }
    grid_bot_spot_infinity = {
      cpu      = 256
      memory   = 512
      bot_mode = "SPOT"
    }
    grid_bot_futures = {
      cpu      = 256
      memory   = 512
      bot_mode = "FUTURES"
    }
    grid_bot_futures_infinity = {
      cpu      = 256
      memory   = 512
      bot_mode = "FUTURES"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.common_tags
  }
}

###############################################################################
# Default VPC & Subnets
###############################################################################
resource "aws_default_vpc" "default" {
  tags = {
    Name = "default"
  }
}

resource "aws_default_subnet" "default_a" {
  availability_zone = "${var.aws_region}a"

  tags = {
    Name = "default-a"
  }
}

###############################################################################
# Security Group for Fargate Tasks
# - Outbound allowed by default
# - Inbound restricted (since you probably only need outbound to exchanges)
###############################################################################
resource "aws_security_group" "trading_bot_security_group" {
  name        = "trading-bot-security-group"
  description = "Security group for trading bot Fargate tasks"
  vpc_id      = aws_default_vpc.default.id

  # No inbound rules needed if you don't accept inbound traffic
  ingress {
    description = "No inbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["127.0.0.1/32"] # effectively block inbound
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "trading-bot-security-group"
  }
}

###############################################################################
# ECS Cluster
###############################################################################
resource "aws_ecs_cluster" "trading_bots_cluster" {
  name = "trading-bots-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

###############################################################################
# IAM Roles
###############################################################################
resource "aws_iam_role" "ecs_task_execution_role" {
  name               = "trading-bot-execution-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_execution_role.json
}

data "aws_iam_policy_document" "ecs_task_execution_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_policy" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "ecs_task_role" {
  name               = "trading-bot-task-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_role.json
}

data "aws_iam_policy_document" "ecs_task_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

###############################################################################
# CloudWatch Log Groups
###############################################################################
resource "aws_cloudwatch_log_group" "log_groups" {
  for_each          = local.bots
  name              = "/ecs/${each.key}"
  retention_in_days = 7
}

###############################################################################
# ECR Repositories
###############################################################################
resource "aws_ecr_repository" "repositories" {
  for_each = local.bots
  name     = each.key
}

###############################################################################
# ECS Task Definitions
###############################################################################
resource "aws_ecs_task_definition" "task_definitions" {
  for_each                 = local.bots
  family                   = each.key
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = each.value.cpu
  memory                   = each.value.memory
  execution_role_arn       = aws_iam_role.ecs_task_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture       = "ARM64"
  }

  container_definitions = jsonencode([
    {
      name      = each.key
      image     = "${aws_ecr_repository.repositories[each.key].repository_url}:latest"
      essential = true
      environment = [
        {
          name  = "LOG_LEVEL"
          value = "INFO"
        },
        {
          name  = "BOT_MODE"
          value = each.value.bot_mode
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.log_groups[each.key].name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }
    }
  ])
}

###############################################################################
# ECS Services (one per bot), each uses FARGATE
# - desired_count = 1 ensures each bot runs exactly one instance
###############################################################################
resource "aws_ecs_service" "services" {
  for_each        = local.bots
  name            = "${each.key}-service"
  cluster         = aws_ecs_cluster.trading_bots_cluster.id
  task_definition = aws_ecs_task_definition.task_definitions[each.key].arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = [aws_default_subnet.default_a.id]
    security_groups  = [aws_security_group.trading_bot_security_group.id]
    assign_public_ip = true
  }

  deployment_controller {
    type = "ECS"
  }
}

###############################################################################
# SNS Topic and Lambda Subscription for Error Notifications
###############################################################################
resource "aws_sns_topic" "error_notifications" {
  name = "trading-bot-slack-error-notifications"
}

resource "aws_sns_topic_subscription" "lambda_subscription" {
  topic_arn = aws_sns_topic.error_notifications.arn
  protocol  = "lambda"
  endpoint  = "arn:aws:lambda:${var.aws_region}:${var.aws_account_id}:function:cloud-watch-errors-slack-notifications-lambda"
}

resource "aws_lambda_permission" "with_sns" {
  statement_id  = "AllowExecutionFromSNS"
  action        = "lambda:InvokeFunction"
  function_name = "cloud-watch-errors-slack-notifications-lambda"
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.error_notifications.arn
}

###############################################################################
# CloudWatch Metric Filters for Error Monitoring
###############################################################################
resource "aws_cloudwatch_log_metric_filter" "error_filters" {
  for_each       = local.bots
  name           = "${each.key}s"
  log_group_name = aws_cloudwatch_log_group.log_groups[each.key].name
  pattern        = "\"?ERROR\""

  metric_transformation {
    name      = each.key
    namespace = "TradingBotErrors"
    value     = "1"
    unit      = "Count"
  }
}

###############################################################################
# CloudWatch Alarms for Error Notifications
###############################################################################
resource "aws_cloudwatch_metric_alarm" "error_alarms" {
  for_each            = aws_cloudwatch_log_metric_filter.error_filters
  alarm_name          = "${each.key}_error_alarm"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = each.value.metric_transformation[0].name
  namespace           = "TradingBotErrors"
  period              = 10 # 10 seconds is the minimum allowed period
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "Monitors for ERROR messages in ${each.key} logs"

  alarm_actions = [aws_sns_topic.error_notifications.arn]

  tags = {
    Service = each.key
  }
}

###############################################################################
# IAM Policy for CloudWatch Logs Metric Filters
###############################################################################
resource "aws_iam_policy" "cloudwatch_logs_metric_policy" {
  name        = "CloudWatchLogsMetricPolicy"
  description = "Allows CloudWatch Logs to publish metrics for ECS trading bots."

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:PutMetricFilter",
          "logs:GetMetricFilter",
          "logs:DeleteMetricFilter",
          "logs:DescribeMetricFilters"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "attach_cloudwatch_logs_metric_policy" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = aws_iam_policy.cloudwatch_logs_metric_policy.arn
}