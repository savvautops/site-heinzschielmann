// functions/api/content.js
// Cloudflare Pages Function — reads site content from D1 at runtime
// Powers the admin panel saves + the /api/content endpoint for SSR builds

export async function onRequestGet(context) {
  const { env } = context;

  try {
    const rows = await env.DB.prepare(
      "SELECT key, value FROM site_content"
    ).all();

    const assets = await env.DB.prepare(
      "SELECT role, filename, caption, ord FROM site_assets ORDER BY role, ord"
    ).all();

    const content = {};
    for (const row of rows.results) {
      content[row.key] = row.value;
    }

    const groupedAssets = {};
    for (const asset of assets.results) {
      if (!groupedAssets[asset.role]) groupedAssets[asset.role] = [];
      groupedAssets[asset.role].push({ filename: asset.filename, caption: asset.caption });
    }

    return Response.json({ content, assets: groupedAssets });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const { key, value } = body;

    if (!key || value === undefined) {
      return Response.json({ error: "key and value required" }, { status: 400 });
    }

    await env.DB.prepare(
      "INSERT OR REPLACE INTO site_content (key, value, updated_at) VALUES (?, ?, unixepoch())"
    ).bind(key, value).run();

    // Trigger Cloudflare Pages rebuild via deploy hook
    const deployHook = await env.DB.prepare(
      "SELECT value FROM site_content WHERE key = 'deploy_hook'"
    ).first();

    if (deployHook?.value) {
      await fetch(deployHook.value, { method: "POST" }).catch(() => {});
    }

    return Response.json({ success: true, key, value });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
