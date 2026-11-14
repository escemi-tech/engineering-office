terraform {
  required_version = ">= 1.13.0, < 2.0.0"

  backend "s3" {
    key                         = "professional-host.tfstate"
    use_lockfile                = true
    use_path_style              = true
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_s3_checksum            = true
  }

  encryption {
    key_provider "pbkdf2" "professional" {
      passphrase = trimspace(file(var.state_password_file))
    }
    method "aes_gcm" "professional" {
      keys = key_provider.pbkdf2.professional
    }
    state {
      method   = method.aes_gcm.professional
      enforced = true
    }
    plan {
      method   = method.aes_gcm.professional
      enforced = true
    }
  }
}

variable "state_password_file" {
  type        = string
  description = "Canonical absolute path to the separately recoverable state encryption password."
  validation {
    condition     = startswith(var.state_password_file, "/")
    error_message = "Use an absolute path to the protected password file."
  }
}
