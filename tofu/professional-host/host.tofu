locals {
  host_name = var.qualification == null ? "engineering-office" : "engineering-office-q-${var.qualification.run_id}"
  ownership = merge({
    owner      = "engineering-office"
    managed_by = "opentofu"
    purpose    = var.qualification == null ? "professional-host" : "qualification"
  }, var.qualification == null ? {} : var.qualification)
}

data "openstack_images_image_v2" "ubuntu" {
  name        = "Ubuntu 26.04"
  most_recent = true
  visibility  = "public"
}

data "openstack_compute_flavor_v2" "host" {
  name  = "b3-8"
  vcpus = 2
  ram   = 8000
  disk  = 50
}

data "openstack_networking_network_v2" "public" {
  name     = "Ext-Net"
  external = true
}

resource "openstack_compute_keypair_v2" "operator" {
  name       = local.host_name
  public_key = trimspace(var.ssh_public_key)
}

resource "openstack_networking_secgroup_v2" "host" {
  name                 = local.host_name
  description          = jsonencode(local.ownership)
  delete_default_rules = true
}

# Package repositories, S3 and inference endpoints do not have fixed destination
# CIDRs. This IPv4 egress rule grants no incoming access; see ADR 0009.
# trivy:ignore:OPNSTK-0004
resource "openstack_networking_secgroup_rule_v2" "outbound" {
  security_group_id = openstack_networking_secgroup_v2.host.id
  direction         = "egress"
  ethertype         = "IPv4"
  remote_ip_prefix  = "0.0.0.0/0"
}

# A roaming operator reaches WireGuard from changing addresses. Only UDP 51820
# is public; WireGuard authenticates peers before exposing SSH. See ADR 0009.
# trivy:ignore:OPNSTK-0003
resource "openstack_networking_secgroup_rule_v2" "wireguard" {
  security_group_id = openstack_networking_secgroup_v2.host.id
  direction         = "ingress"
  ethertype         = "IPv4"
  protocol          = "udp"
  port_range_min    = 51820
  port_range_max    = 51820
  remote_ip_prefix  = "0.0.0.0/0"
}

resource "openstack_networking_secgroup_rule_v2" "bootstrap" {
  count             = var.bootstrap_ssh_cidr == null ? 0 : 1
  security_group_id = openstack_networking_secgroup_v2.host.id
  direction         = "ingress"
  ethertype         = "IPv4"
  protocol          = "tcp"
  port_range_min    = 22
  port_range_max    = 22
  remote_ip_prefix  = var.bootstrap_ssh_cidr
}

resource "openstack_compute_instance_v2" "host" {
  name            = local.host_name
  image_id        = data.openstack_images_image_v2.ubuntu.id
  flavor_id       = data.openstack_compute_flavor_v2.host.id
  key_pair        = openstack_compute_keypair_v2.operator.name
  security_groups = [openstack_networking_secgroup_v2.host.name]
  config_drive    = true
  user_data       = "#cloud-config\nssh_pwauth: false\ndisable_root: true\n"
  metadata        = local.ownership

  # Basic Public IP uses the existing external network, with no managed gateway,
  # floating IP, private network or separately retained boot volume.
  network {
    uuid = data.openstack_networking_network_v2.public.id
  }

  depends_on = [
    openstack_networking_secgroup_rule_v2.outbound,
    openstack_networking_secgroup_rule_v2.wireguard,
    openstack_networking_secgroup_rule_v2.bootstrap,
  ]

  timeouts {
    create = "15m"
    delete = "15m"
  }

  lifecycle {
    precondition {
      condition     = data.openstack_images_image_v2.ubuntu.id == var.image_id && data.openstack_images_image_v2.ubuntu.visibility == "public"
      error_message = "Only the reviewed public Ubuntu 26.04 image is supported."
    }
    precondition {
      condition     = var.qualification == null ? true : var.quote.hourly_eur_with_tax * 3 <= 0.60
      error_message = "A qualification run reserves three billed hours and must fit EUR 0.60 including tax."
    }
  }
}
