# main.tf for Ecstasy OS HRMS Backend and Frontend

# ===================================================================
# 1. CONFIGURE THE TERRAFORM PROVIDER FOR AZURE
# ===================================================================
terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~>3.0"
    }
  }
}

provider "azurerm" {
  skip_provider_registration = true
  features {}
}

# ===================================================================
# 2. DEFINE VARIABLES
# ===================================================================
variable "resource_group_name" {
  description = "The name of the existing Azure Resource Group."
  type        = string
  default     = "ecstasy_os_rg"
}

variable "location" {
  description = "The Azure region where resources will be created."
  type        = string
  default     = "UAE North"
}

variable "app_name_prefix" {
  description = "A unique prefix for naming the resources."
  type        = string
  default     = "ecstasyos"
}

variable "aws_access_key_id" {
  description = "The AWS Access Key ID for Rekognition."
  type        = string
  sensitive   = true
}

variable "aws_secret_access_key" {
  description = "The AWS Secret Access Key for Rekognition."
  type        = string
  sensitive   = true
}

# ===================================================================
# 3. REFERENCE EXISTING RESOURCE GROUP
# ===================================================================
data "azurerm_resource_group" "existing_rg" {
  name = var.resource_group_name
}

# ===================================================================
# 4. CREATE RESOURCES (Backend and Frontend)
# ===================================================================

# --- Backend API Resources (Unchanged) ---
resource "azurerm_container_registry" "acr" {
  name                = "${var.app_name_prefix}acr"
  resource_group_name = data.azurerm_resource_group.existing_rg.name
  location            = data.azurerm_resource_group.existing_rg.location
  sku                 = "Basic"
  admin_enabled       = true
}

resource "azurerm_service_plan" "app_plan" {
  name                = "${var.app_name_prefix}-app-plan"
  resource_group_name = data.azurerm_resource_group.existing_rg.name
  location            = data.azurerm_resource_group.existing_rg.location
  os_type             = "Linux"
  sku_name            = "B1"
}

resource "azurerm_linux_web_app" "web_app" {
  name                = "${var.app_name_prefix}-hrms-api"
  resource_group_name = data.azurerm_resource_group.existing_rg.name
  location            = data.azurerm_resource_group.existing_rg.location
  service_plan_id     = azurerm_service_plan.app_plan.id

  site_config {
    always_on = false
  }

  app_settings = {
    "DATABASE_URL"                  = "postgresql://legalgpt:Meta%40321@legalgpt.postgres.database.azure.com:5432/ecstasy_os"
    "SECRET_KEY"                    = "09d25e094faa6ca2556c818166b7a9563b93f7099f6f0f4caa6cf63b88e8d3e7"
    "ALGORITHM"                     = "HS256"
    "ACCESS_TOKEN_EXPIRE_MINUTES"   = "30"
    "AWS_ACCESS_KEY_ID"             = var.aws_access_key_id
    "AWS_SECRET_ACCESS_KEY"         = var.aws_secret_access_key
    "AWS_REGION"                    = "ap-south-1"
    "DOCKER_REGISTRY_SERVER_URL"    = "https://${azurerm_container_registry.acr.login_server}"
    "DOCKER_REGISTRY_SERVER_USERNAME" = azurerm_container_registry.acr.admin_username
    "DOCKER_REGISTRY_SERVER_PASSWORD" = azurerm_container_registry.acr.admin_password
  }

  identity {
    type = "SystemAssigned"
  }
}

# --- NEW: Frontend Static Website Resource ---
# This creates a low-cost storage account and enables the static website feature.
resource "azurerm_storage_account" "frontend_storage" {
  name                     = "${var.app_name_prefix}frontendstorage"
  resource_group_name      = data.azurerm_resource_group.existing_rg.name
  location                 = data.azurerm_resource_group.existing_rg.location
  account_tier             = "Standard"
  account_replication_type = "LRS" # Locally-redundant storage is the cheapest option

  static_website {
    index_document     = "index.html"
    error_404_document = "index.html" # Redirects all not-found pages to the main app
  }
}
