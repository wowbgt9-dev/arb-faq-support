
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: corsHeaders
  });
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
      // CHECK WORKER AND DATABASE
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

      // GET FAQ LIST
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

      // CREATE FAQ
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

        const result = await env.DB.prepare(`
          INSERT INTO faqs
          (category, question, answer, details, sort_order)
          VALUES (?, ?, ?, ?, ?)
        `).bind(
          category,
          question,
          answer,
          details,
          sort_order
        ).run();

        return json({
          success: true,
          message: "FAQ created successfully",
          id: result.meta.last_row_id
        }, 201);
      }

      const match = path.match(/^\/api\/faqs\/(\d+)$/);

      // UPDATE FAQ
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

        const result = await env.DB.prepare(`
          UPDATE faqs
          SET category = ?,
              question = ?,
              answer = ?,
              details = ?,
              sort_order = ?,
              is_published = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(
          category,
          question,
          answer,
          details,
          sort_order,
          is_published,
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

      // DELETE FAQ
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

      // SERVE FRONTEND
      return env.ASSETS.fetch(request);

    } catch (error) {
      return json({
        success: false,
        error: error.message
      }, 500);
    }
  }
};
