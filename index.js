import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import Consul from "consul";
import session from "express-session";
import Keycloak from "keycloak-connect";
import util from "util";
import request from "request";
import jwt from "jsonwebtoken";

import winston from "winston";
import bodyParser from "body-parser";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const logger = winston.createLogger({
  level: "error",
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: "error.log", level: "error" }),
    new winston.transports.Console(),
  ],
});

app.use(
  cors({
    credentials: true,
    origin: [
      "http://localhost:8300",
      "http://localhost:8500",
      "http://localhost:3000",
      "http://localhost:4200",
      "http://localhost:8081",
      "http://127.0.0.1:8081",
      "*",
      "127.0.0.1:8500",
    ],
    allowedHeaders: [
      "Origin",
      "X-Requested-With",
      "Content-Type",
      "Accept",
      "Authorization",
      "set-cookie",
      "cookie",
      "user",
    ],
    methods: ["GET", "POST", "OPTIONS", "DELETE", "PATCH", "PUT"],
  })
);
// app.use(cors({credentials: true, origin: true, exposedHeaders: '*'}));
// Consul client setup
// const consul = new Consul();
// when use docker use container name use consul or just host.docker.internal
// const consulClient = new Consul({ host: process.env.CONSUL, port: "8500" });

const service = {
  id: "service-node3", // Unique identifier for your service
  name: "service-node3", // Friendly name for your service
  address: "host.docker.internal", // Hostname or IP address of the service
  port: 3000, // Port where your service listens
  // tags: ["tag1", "tag2"], // Optional service tags
  check: {
    // Optional health check configuration
    http: "http://host.docker.internal:3000/health", // URL for health check
    interval: "10s", // Check interval (e.g., '10s', '5m')
  },
};

// consulClient.agent.service.register(service, (err) => {
//   console.log("called");

//   if (err) {
//     console.error("Error registering service:", err);
//   } else {
//     console.log("Service registered successfully!");
//   }
// });

// consulClient.agent.service.list((err, services) => {
//   if (err) throw err;

//   const service = services[serviceName];

//   if (!service) throw new Error(`Service ${serviceName} not found`);

//   console.log(
//     `Found service ${serviceName} at ${service.Address}:${service.Port}`
//   );
// });

app.get("/health", (req, res) => {
  console.log("called Health check");
  res.send("OK");
});

const memoryStore = new session.MemoryStore();
app.use(
  session({
    secret: "some secret",
    resave: false,
    saveUninitialized: true,
    store: memoryStore,
  })
);

const kcConfig = {
  clientId: process.env.KEYCLOAK_CLIENT_ID,
  bearerOnly: true,
  serverUrl:  process.env.KEYCLOAK_URL,
  url: process.env.KEYCLOAK_URL,
  // authServerUrl: 'http://host.docker.internal:8086/auth',
  // serverUrl: 'http://localhost:8080/auth',
  realm: process.env.KEYCLOAK_REALM,
  clientSecret: process.env.KEYCLOAK_CLIENT_SECRET,
  credentials: {
    secret:process.env.KEYCLOAK_CLIENT_SECRET,
  },
  realmPublicKey:process.env.KEYCLOAK_PUBLIC_KEY,
};

const keycloak = new Keycloak({ store: memoryStore }, kcConfig);

app.use(keycloak.middleware(), bodyParser.json());
// console.log(keycloak.getGrant());
// keycloak.protect()
app.get("/secure", keycloak.protect(), async (req, res) => {
  const grant = await keycloak.getGrant(req, res, {
    response_mode: "permissions",
  });
  console.log();
  // console.log(keycloak.getConfig());
  // console.log();
  // console.log();
  // const userinfo=await fetch("http://keycloak_web:8086/realms/MICROSERVICE/protocol/openid-connect/userinfo");
  // console.log(userinfo);
  // const token = req.kauth.grant.access_token.content;
  // const permissions = token.authorization ? token.authorization.permissions : undefined;
  // console.log(req.kauth.grant.access_token);
  // console.log(req.kauth);
  const user = req.kauth.grant.access_token.content.sub; // Get user ID
  const client = req.kauth.grant.access_token.content.clientId; // Get client ID

  // Fetch user permissions from Keycloak (adjust logic based on your Keycloak setup)

  // const user=await keycloak.grantManager.userInfo(req.kauth.grant.access_token);
  // console.log(user);
  // .obtainDirectly("user1", "1234")
  // .then((grant) => {
  // console.log(grant);
  // })
  // .catch((err) => {
  //   console.log(err);
  // })
  // keycloak.enforcer()
  res.json(grant.access_token.content);
});

const post = util.promisify(request.post);
const getKeyCloakToken = (username, password) => {
  console.log(kcConfig.credentials.secret);
  // console.log(kcConfig);
  return post({
    baseUrl: `${kcConfig.serverUrl}/realms/${kcConfig.realm}`,
    url: "/protocol/openid-connect/token",
    form: {
      grant_type: "password",
      client_id: kcConfig.clientId,
      client_secret: kcConfig.credentials.secret,
      username,
      password,
    },
  });
};
// keycloak.enforcer('user:email', {response_mode: 'permissions'})
// FRMF:ADD
app.get(
  "/me",
  keycloak.enforcer(["FRMF:DELETE"], { response_mode: "permissions" }),
  async (req, res) => {
    // console.log(process.env.KEYCLOAK_PUBLIC_KEY);
    // console.log(req.kauth);
    //  console.log(keycloak);
    // keycloak.checkSso();
    keycloak.authenticated(req);
// console.log(keycloak.getConfig());
    //  keycloak.
    // console.log(kenf2)
    res.json(true);
  }
);

app.get("/permissions",keycloak.protect(),  (req, res) => {
  console.log(req.kauth.grant.access_token);
  // console.log()
  const data = {
    grant_type: "urn:ietf:params:oauth:grant-type:uma-ticket",
    audience: "EXPRESS",
  };
  const body = new URLSearchParams();
  for (const key in data) {
    if (data.hasOwnProperty(key)) {
      body.append(key, data[key]);
    }
  }
  fetch(
    `${kcConfig.serverUrl}/realms/${kcConfig.realm}/protocol/openid-connect/token`,
    {
      method: "POST",
      // authorization: "bearer " + req.kauth.grant.access_token,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        'Authorization': `Bearer ${req.kauth.grant.access_token.token}`
      },
      body: body.toString(),
    }
  ) 
    .then((response) => response.json())
    .then((data) => {
      console.log("Success:", data);
      return res.json(jwt.decode(data.access_token).authorization.permissions);
    })
    .catch((error) => {
      console.error("Error:", error);
    });
  // keycloak.enforcer(['FRMF:ADD'], { response_mode: 'permissions' })(req, res, () => {
  //   const permissions = req.permissions || [];
  //   res.json({ permissions });
  // });
});

app.get("/owner", keycloak.protect("realm:OWNER"), (req, res) => {
  res.json(true);
});

function owner(token, request) {
  //  token.hasRole( request.params.section );

  console.log(token.hasRealmRole("OWNER"));
  console.log(token.hasRole(`realm:USER`));
  return token.hasRealmRole("OWNER");
  // return true;
}

app.use((err, req, res, next) => {
  res.status(500).send("Something went wrong!");
});

app.get("/customers", (req, res) => {
  console.log("called customers");
  res.json([
    { id: 0, name: "ANAS" },
    { id: 1, name: "Ali" },
    { id: 1, name: "Ouahiba" },
  ]);
});
app.get("/customers/:id", (req, res) => {
  console.log("called customers");
  res.json({ id: req.params.id, name: "ANAS" });
});

app.get("/service-node", (req, res) => {
  res.send("Hello from service-node!");
});

app.get("/config", async (req, res) => {
  try {
    const result = await consulClient.kv.get("config/db-url").catch((error) => {
      console.log(error);
    });
    res.send({ result });
  } catch (error) {
    res.status(500).send("Error retrieving config");
  }
});

app.get("/", (req, res) => {
  res.send("Express + TypeScript Server");
});

app.listen(port, async () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
  const adminData = await getKeyCloakToken("owner", "1234");
  const adminToken = await JSON.parse(adminData.body);
  console.log(adminToken,"adminToken");
});
