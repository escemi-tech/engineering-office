run "create_recovery_identity" {
  command = apply
  assert {
    condition     = output.recovery == "synthetic-professional-state-recovery-canary"
    error_message = "The recovery workspace must retain its synthetic value."
  }
}

run "preserve_recovery_identity" {
  command = plan
  assert {
    condition     = length(output.identity) > 0
    error_message = "A repeated plan must preserve the existing recovery identity."
  }
}
