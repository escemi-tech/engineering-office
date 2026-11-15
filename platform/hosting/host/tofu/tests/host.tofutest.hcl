# Arrange: native provider mocks validate configuration, never live compatibility.
mock_provider "openstack" {
  mock_data "openstack_images_image_v2" {
    defaults = {
      id = "10000000-0000-4000-8000-000000000001"
    }
  }
  mock_data "openstack_compute_flavor_v2" {
    defaults = {
      id = "10000000-0000-4000-8000-000000000002"
    }
  }
  mock_data "openstack_networking_network_v2" {
    defaults = {
      id = "10000000-0000-4000-8000-000000000003"
    }
  }
}

variables {
  project_id         = "10000000-0000-4000-8000-000000000004"
  image_id           = "10000000-0000-4000-8000-000000000001"
  ssh_public_key     = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
  bootstrap_ssh_cidr = "192.0.2.10/32"
  quote = {
    hourly_eur_with_tax  = 0.074
    monthly_eur_with_tax = 57
  }
  qualification = {
    run_id     = "20000000-0000-4000-8000-000000000001"
    expires_at = "2099-01-01T12:00:00Z"
  }
}

# Act: plan the complete disposable host.
run "bounded_bootstrap" {
  command = plan
  # Assert: one explicit network and owned group, default ingress removed.
  assert {
    condition = (
      length(openstack_compute_instance_v2.host.network) == 1 &&
      openstack_compute_instance_v2.host.network[0].uuid == data.openstack_networking_network_v2.public.id &&
      openstack_compute_instance_v2.host.security_groups == toset([openstack_networking_secgroup_v2.host.name]) &&
      openstack_networking_secgroup_v2.host.delete_default_rules &&
      length(openstack_compute_instance_v2.host.block_device) == 0 &&
      openstack_networking_secgroup_rule_v2.bootstrap[0].remote_ip_prefix == "192.0.2.10/32" &&
      openstack_networking_secgroup_rule_v2.wireguard.port_range_min == 51820 &&
      openstack_compute_instance_v2.host.metadata["run_id"] == var.qualification.run_id
    )
    error_message = "The host must retain the quoted direct-IP shape and run ownership, with only scoped bootstrap SSH and WireGuard ingress."
  }
}

# Act / Assert: cutover removes the provider SSH rule from the desired state.
run "private_only_cutover" {
  command = plan
  variables { bootstrap_ssh_cidr = null }
  assert {
    condition     = length(openstack_networking_secgroup_rule_v2.bootstrap) == 0
    error_message = "Private cutover must remove public SSH ingress."
  }
}

# Act: plan a simultaneous recovery host outside the closed campaign.
run "isolated_recovery" {
  command = plan
  variables {
    qualification = null
    recovery = {
      run_id     = "20000000-0000-4000-8000-000000000001"
      expires_at = "2099-01-01T12:00:00Z"
    }
  }
  # Assert: every named provider resource has a distinct recovery identity.
  assert {
    condition = (
      openstack_compute_instance_v2.host.name == "engineering-office-restore-${var.recovery.run_id}" &&
      openstack_compute_keypair_v2.operator.name == openstack_compute_instance_v2.host.name &&
      openstack_networking_secgroup_v2.host.name == openstack_compute_instance_v2.host.name &&
      openstack_compute_instance_v2.host.metadata["purpose"] == "recovery" &&
      openstack_compute_instance_v2.host.metadata["expires_at"] == var.recovery.expires_at
    )
    error_message = "Recovery must not reuse the retained host or qualification resources."
  }
}

# Act / Assert: one host cannot consume two separately approved lifecycles.
run "reject_mixed_lifecycles" {
  command = plan
  variables {
    recovery = {
      run_id     = "20000000-0000-4000-8000-000000000001"
      expires_at = "2099-01-01T12:00:00Z"
    }
  }
  expect_failures = [var.recovery]
}

run "reject_expensive_recovery" {
  command = plan
  variables {
    qualification = null
    recovery = {
      run_id     = "20000000-0000-4000-8000-000000000001"
      expires_at = "2099-01-01T12:00:00Z"
    }
    quote = { hourly_eur_with_tax = 0.25, monthly_eur_with_tax = 57 }
  }
  expect_failures = [openstack_compute_instance_v2.host]
}

# Act / Assert: reject unsafe scope, unreviewed image drift and over-budget runs.
run "reject_broad_ssh" {
  command = plan
  variables { bootstrap_ssh_cidr = "0.0.0.0/0" }
  expect_failures = [var.bootstrap_ssh_cidr]
}

run "reject_changed_image" {
  command = plan
  variables { image_id = "10000000-0000-4000-8000-000000000099" }
  expect_failures = [openstack_compute_instance_v2.host]
}

run "reject_expensive_test" {
  command = plan
  variables {
    quote = { hourly_eur_with_tax = 0.25, monthly_eur_with_tax = 57 }
  }
  expect_failures = [openstack_compute_instance_v2.host]
}

run "reject_monthly_ceiling" {
  command = plan
  variables {
    quote = { hourly_eur_with_tax = 0.074, monthly_eur_with_tax = 101 }
  }
  expect_failures = [var.quote]
}

# Act / Assert: a separately approved retained host has no test-expiry marker.
run "retained_host" {
  command = plan
  variables { qualification = null }
  assert {
    condition     = openstack_compute_instance_v2.host.name == "engineering-office" && !contains(keys(openstack_compute_instance_v2.host.metadata), "expires_at")
    error_message = "The qualification cleanup must not adopt a retained host."
  }
}
