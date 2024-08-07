import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import logger from "morgan";
import http from "http";
import { errorController } from "./controllers/errorController";
import { rateLimitController } from "./controllers/rateLimitController";
import { userRoutes } from "./routes/auth/userRoutes";
import { tokenRoutes } from "./routes/token/tokenRoutes";
import { eventRoutes } from "./routes/event/eventRoutes";
import { monitoringRoutes } from "./routes/monitoring/monitoringRoutes";
import { newsLetterRoutes } from "./routes/newsLetter/newsLetterRoutes";
import {
  startRequestMonitoringTimer,
  endRequestMonitoringTimer,
} from "./controllers/monitoringController";
import { keepActiveRoutes } from "./routes/keepActive/keepActiveRoutes";

dotenv.config();

const app = express();

if (process.env.NODE_ENV === "production") {
  app.use(cors({ origin: "*" }));
} else {
  app.use(cors());
}

const server = http.createServer(app);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(logger("dev"));

app.use(rateLimitController);
app.use(startRequestMonitoringTimer);

app.use("/api/v1/users", userRoutes);
app.use("/api/v1/tokens", tokenRoutes);
app.use("/api/v1/events", eventRoutes);
app.use("/api/v1/newsletter", newsLetterRoutes);

app.use(monitoringRoutes);
app.use(keepActiveRoutes);
app.use(endRequestMonitoringTimer);

app.use(errorController);

app.use("*", (req: Request, res: Response) => {
  res.status(404).json({
    status: "fail",
    message: "Endpoint not found!",
  });
});

export { server };
