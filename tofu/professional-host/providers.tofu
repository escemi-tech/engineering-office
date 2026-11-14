terraform {
  required_providers {
    openstack = {
      source  = "registry.opentofu.org/terraform-provider-openstack/openstack"
      version = "3.4.0"
    }
  }
}

# Native clouds.yaml holds credentials outside the repository and saved plans.
provider "openstack" {
  cloud     = "engineering-office-provisioner"
  region    = "GRA11"
  tenant_id = var.project_id
}
