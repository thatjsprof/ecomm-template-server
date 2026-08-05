import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";
import { error } from "../utils/response";

export function validate(schema: ZodSchema, source: "body" | "query" | "params" = "body") {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const message = result.error.errors
        .map((e) => {
          const path = e.path.length ? `${e.path.join(".")}: ` : "";
          return `${path}${e.message}`;
        })
        .join(", ");
      return error(res, message, 400);
    }

    // Express 5: req.query / req.params are read-only getters
    if (source === "body") {
      req.body = result.data;
    } else {
      Object.defineProperty(req, source, {
        value: result.data,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }

    next();
  };
}
