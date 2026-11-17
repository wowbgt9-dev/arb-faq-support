
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const MAX_CONTENT_BYTES = 1800000;

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: corsHeaders
  });
}

function contentSize(value) {
  return new TextEncoder().encode(value).length;
}

function normalizeContent(body) {
  let content = body.content_json ?? [];

  if (typeof content !== "string") {
    content = JSON.stringify(content);
  }

  if (contentSize(content) > MAX_CONTENT_BYTES) {
    throw new Error(
      "FAQ content is too large. Reduce image sizes and try again."
    );
  }

  try {
    const parsed = JSON.parse(content);

    if (!Array.isArray(parsed)) {
      throw new Error("Content must be an array.");
    }

    for (const block of parsed) {
      if (!block || !["text", "image"].includes(block.type)) {
        throw new Error("Invalid content block.");
      }

      if (block.type === "text" && typeof block.text !== "string") {
        throw new Error("Invalid text block.");
      }

      if (
        block.type === "image" &&
        (
          typeof block.src !== "string" ||
          !/^data:image\/(jpeg|png|webp|gif);base64,/i.test(block.src)
        )
      ) {
        throw new Error("Invalid image block.");
      }
    }

  } catch (error) {
    throw new Error("Invalid FAQ content: " + error.message);
  }

  return content;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    try {
      if (path === "/api/health" && request.method === "GET") {
        const result = await env.DB.prepare(
          "SELECT 1 AS connected"
        ).first();

        return json({
          success: true,
          message: "ARB FAQ Support API is running",
          database: result?.connected === 1
            ? "connected"
            : "disconnected"
        });
      }

      if (path === "/api/faqs" && request.method === "GET") {
        const { results } = await env.DB.prepare(`
          SELECT *
          FROM faqs
          ORDER BY sort_order ASC, id ASC
        `).all();

        return json({
          success: true,
          total: results.length,
          data: results
        });
      }

      if (path === "/api/faqs" && request.method === "POST") {
        const body = await request.json();

        const {
          category,
          question,
          answer,
          details = "",
          sort_order = 0
        } = body;

        if (!category || !question || !answer) {
          return json({
            success: false,
            error: "Category, question and answer are required."
          }, 400);
        }

        const content = normalizeContent(body);

        const result = await env.DB.prepare(`
          INSERT INTO faqs
          (
            category,
            question,
            answer,
            details,
            sort_order,
            content_json
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(
          category,
          question,
          answer,
          details,
          Number(sort_order) || 0,
          content
        ).run();

        return json({
          success: true,
          message: "FAQ created successfully",
          id: result.meta.last_row_id
        }, 201);
      }

      const match = path.match(/^\/api\/faqs\/(\d+)$/);

      if (match && request.method === "PUT") {
        const id = Number(match[1]);
        const body = await request.json();

        const {
          category,
          question,
          answer,
          details = "",
          sort_order = 0,
          is_published = 1
        } = body;

        if (!category || !question || !answer) {
          return json({
            success: false,
            error: "Category, question and answer are required."
          }, 400);
        }

        const content = normalizeContent(body);

        const result = await env.DB.prepare(`
          UPDATE faqs
          SET category = ?,
              question = ?,
              answer = ?,
              details = ?,
              sort_order = ?,
              is_published = ?,
              content_json = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(
          category,
          question,
          answer,
          details,
          Number(sort_order) || 0,
          Number(is_published) ? 1 : 0,
          content,
          id
        ).run();

        if (result.meta.changes === 0) {
          return json({
            success: false,
            error: "FAQ not found."
          }, 404);
        }

        return json({
          success: true,
          message: "FAQ updated successfully"
        });
      }

      if (match && request.method === "DELETE") {
        const id = Number(match[1]);

        const result = await env.DB.prepare(
          "DELETE FROM faqs WHERE id = ?"
        ).bind(id).run();

        if (result.meta.changes === 0) {
          return json({
            success: false,
            error: "FAQ not found."
          }, 404);
        }

        return json({
          success: true,
          message: "FAQ deleted successfully"
        });
      }

      if (path.startsWith("/api/")) {
        return json({
          success: false,
          error: "API endpoint not found."
        }, 404);
      }

      return env.ASSETS.fetch(request);

    } catch (error) {
      return json({
        success: false,
        error: error.message || "Internal server error."
      }, 500);
    }
  }
};
