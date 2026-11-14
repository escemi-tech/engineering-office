variable "project_id" {
  type        = string
  description = "Approved OpenStack project UUID, not the OVH service identifier."
  validation {
    condition     = can(regex("^[a-f0-9]{32}$|^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$", var.project_id))
    error_message = "Supply the scoped OpenStack project UUID."
  }
}

variable "image_id" {
  type        = string
  description = "Reviewed public Ubuntu 26.04 amd64 image UUID; updates require a new plan."
}

variable "ssh_public_key" {
  type        = string
  description = "Existing operator SSH public key; never supply a private key."
  validation {
    condition     = can(regex("^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp[0-9]+) [A-Za-z0-9+/=]+( [^\r\n]+)?$", trimspace(var.ssh_public_key)))
    error_message = "Supply one OpenSSH public key."
  }
}

variable "bootstrap_ssh_cidr" {
  type        = string
  default     = null
  nullable    = true
  description = "Operator public IPv4 /32 during bootstrap; null after verified private SSH cutover."
  validation {
    condition     = var.bootstrap_ssh_cidr == null ? true : can(cidrnetmask(var.bootstrap_ssh_cidr)) && endswith(var.bootstrap_ssh_cidr, "/32")
    error_message = "Bootstrap SSH accepts one IPv4 /32 only."
  }
}

variable "quote" {
  type = object({
    hourly_eur_with_tax  = number
    monthly_eur_with_tax = number
  })
  description = "Reviewed complete quote including applicable tax, disk, IPv4, storage and monitoring."
  validation {
    condition     = var.quote.hourly_eur_with_tax > 0 && var.quote.monthly_eur_with_tax > 0 && var.quote.monthly_eur_with_tax <= 100
    error_message = "Supply a positive complete quote within the EUR 100 monthly ceiling."
  }
}

variable "qualification" {
  type = object({
    run_id     = string
    expires_at = string
  })
  default     = null
  nullable    = true
  description = "Disposable campaign run UUID and fixed UTC expiry, or null for a separately approved retained host."
  validation {
    condition = var.qualification == null ? true : (
      can(regex("^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$", var.qualification.run_id)) &&
      can(formatdate("YYYY-MM-DD'T'hh:mm:ss'Z'", var.qualification.expires_at)) &&
      endswith(var.qualification.expires_at, "Z")
    )
    error_message = "Use a unique run UUID and RFC3339 UTC expiry."
  }
}
