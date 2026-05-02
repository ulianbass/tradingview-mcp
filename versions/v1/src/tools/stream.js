import { z } from "zod";
import { jsonResult } from "./_format.js";
import * as core from "../core/streamBuffer.js";

export function registerStreamTools(server) {
  server.tool(
    "stream_start",
    "Start a live streaming buffer for quote/bars/values. Returns a stream_id. Claude then calls stream_read to drain accumulated changes. Use this for 'watch the price for the next minute' or 'tell me when X happens'.",
    {
      kind: z.enum(["quote", "bars", "values"]).describe("What to stream: quote (last price), bars (current bar), values (all indicator values)"),
      interval_ms: z.number().optional().describe("Polling interval in ms (default 500, minimum 100)"),
    },
    async (args = {}) => {
      try {
        return jsonResult(await core.streamStart(args));
      } catch (err) {
        return jsonResult({ success: false, error: err.message, code: err.code }, true);
      }
    },
  );

  server.tool(
    "stream_read",
    "Drain accumulated events from a stream. Returns all changes since last read, then clears the buffer. Safe to call repeatedly.",
    {
      stream_id: z.string().describe("The stream_id returned by stream_start"),
    },
    async ({ stream_id }) => {
      try {
        return jsonResult(await core.streamRead({ stream_id }));
      } catch (err) {
        return jsonResult({ success: false, error: err.message, code: err.code }, true);
      }
    },
  );

  server.tool(
    "stream_stop",
    "Stop a stream and release its buffer. Always call this when done to free resources.",
    {
      stream_id: z.string().describe("The stream_id to stop"),
    },
    async ({ stream_id }) => {
      try {
        return jsonResult(await core.streamStop({ stream_id }));
      } catch (err) {
        return jsonResult({ success: false, error: err.message, code: err.code }, true);
      }
    },
  );

  server.tool(
    "stream_list",
    "List all active streams with their stream_ids, kinds, and buffer sizes.",
    {},
    async () => {
      try {
        return jsonResult(await core.streamList());
      } catch (err) {
        return jsonResult({ success: false, error: err.message, code: err.code }, true);
      }
    },
  );
}
