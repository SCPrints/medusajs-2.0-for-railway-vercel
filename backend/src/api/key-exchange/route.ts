import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { IApiKeyModuleService } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";

import { KEY_EXCHANGE_SECRET } from "../../lib/constants";

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    const configuredSecret = KEY_EXCHANGE_SECRET?.trim();
    if (configuredSecret) {
      const header = req.get("x-medusa-key-exchange-secret")?.trim();
      const querySecret =
        typeof req.query?.secret === "string"
          ? req.query.secret.trim()
          : "";
      const provided = header || querySecret;
      if (provided !== configuredSecret) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }
    }

    const apiKeyModuleService: IApiKeyModuleService =
      req.scope.resolve(Modules.API_KEY);
    const apiKeys = await apiKeyModuleService.listApiKeys();
    const defaultApiKey = apiKeys.find((apiKey) => apiKey.title === "Webshop");
    if (!defaultApiKey) {
      res.json({});
    } else {
      res.json({ publishableApiKey: defaultApiKey.token });
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    res.status(500).json({ error: message });
  }
};
