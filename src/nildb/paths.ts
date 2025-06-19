export const NilDbEndpoint = {
  v1: {
    builders: {
      register: "/v1/builders/register",
      me: "/v1/builders/me",
    },
    data: {
      root: "/v1/data",
      find: "/v1/data/find",
      update: "/v1/data/update",
      delete: "/v1/data/delete",
      flushById: "/v1/data/:id/flush",
      tailById: "/v1/data/:id/tail",
      createOwned: "/v1/data/owned",
      createStandard: "/v1/data/standard",
    },
    queries: {
      root: "/v1/queries",
      byId: "/v1/queries/:id",
      run: "/v1/queries/run",
      runById: "/v1/queries/run/:id",
    },
    collections: {
      root: "/v1/collections",
      byId: "/v1/collections/:id",
      indexesById: "/v1/collections/:id/indexes",
      indexesByNameById: "/v1/collections/:id/indexes/:name",
    },
    system: {
      about: "/about",
      health: "/health",
      metrics: "/metrics",
      openApiJson: "/openapi.json",
      maintenanceStart: "/v1/system/maintenance/start",
      maintenanceStop: "/v1/system/maintenance/stop",
      logLevel: "/v1/system/log-level",
    },
    users: {
      me: "/v1/users/me",
      data: {
        root: "/v1/users/data",
        byId: "/v1/users/data/:collection/:document",
        aclById: "/v1/users/data/:collection/:document/acl",
        acl: {
          grant: "/v1/users/data/acl/grant",
          update: "/v1/users/data/acl/update",
          revoke: "/v1/users/data/acl/revoke",
        },
      },
    },
  },
} as const;
