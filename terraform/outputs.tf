output "ecs_cluster_name" {
  description = "Name of the ECS cluster"
  value       = aws_ecs_cluster.trading_bots_cluster.name
}

output "ecs_cluster_arn" {
  description = "ARN of the ECS cluster"
  value       = aws_ecs_cluster.trading_bots_cluster.arn
}

# output "service_arns" {
#   description = "Map of service names to their ARNs"
#   value = {
#     spot_stable         = aws_ecs_service.grid_bot_spot_stable.arn
#     spot_infinity      = aws_ecs_service.grid_bot_spot_infinity.arn
#     futures            = aws_ecs_service.grid_bot_futures.arn
#     futures_infinity   = aws_ecs_service.grid_bot_futures_infinity.arn
#   }
# }

# output "task_definition_arns" {
#   description = "Map of task definition ARNs"
#   value = {
#     spot_stable       = aws_ecs_task_definition.grid_bot_spot_stable.arn
#     spot_infinity    = aws_ecs_task_definition.grid_bot_spot_infinity.arn
#     futures          = aws_ecs_task_definition.grid_bot_futures.arn
#     futures_infinity = aws_ecs_task_definition.grid_bot_futures_infinity.arn
#   }
# }

# output "log_groups" {
#   description = "Map of CloudWatch log groups for each bot"
#   value = {
#     spot_stable       = aws_cloudwatch_log_group.grid_bot_spot_stable.name
#     spot_infinity    = aws_cloudwatch_log_group.grid_bot_spot_infinity.name
#     futures          = aws_cloudwatch_log_group.grid_bot_futures.name
#     futures_infinity = aws_cloudwatch_log_group.grid_bot_futures_infinity.name
#   }
# }