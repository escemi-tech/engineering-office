output "host" {
  description = "Owned resource IDs and public bootstrap address; no credentials."
  value = {
    name              = local.host_name
    id                = openstack_compute_instance_v2.host.id
    public_ipv4       = openstack_compute_instance_v2.host.access_ip_v4
    security_group_id = openstack_networking_secgroup_v2.host.id
    keypair_name      = openstack_compute_keypair_v2.operator.name
    ownership         = local.ownership
  }
}
