import { Request, Response, NextFunction } from "express";
import { error } from "../utils/response";

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  console.error(err.message);
  return error(res, "Something went wrong", 500);
}
