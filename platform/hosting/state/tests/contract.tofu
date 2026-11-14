variable "hold_lock" {
  type    = bool
  default = false
}

resource "terraform_data" "recovery" {
  input = "synthetic-professional-state-recovery-canary"
}

# The only provisioner is a bounded fixture: hold a real backend lock for a peer.
resource "terraform_data" "lock" {
  count = var.hold_lock ? 1 : 0
  provisioner "local-exec" {
    command = "touch .local/lock-held && sleep 15"
  }
}

output "recovery" {
  value     = terraform_data.recovery.output
  sensitive = true
}

output "identity" {
  value = terraform_data.recovery.id
}
