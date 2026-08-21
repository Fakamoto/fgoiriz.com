import assert from "node:assert/strict";
import test from "node:test";

import { handle } from "../worker.mjs";

const files = new Map([
    ["index.html", "<h1>Home</h1>"],
    ["profile.md", "# Profile"],
    ["about/index.html", "<h1>About</h1>"],
    ["about/index.md", "# About"],
    ["404.html", "<h1>Page not found</h1>"],
    ["styles.css", "body { color: black; }"],
]);

globalThis.fetch = async request => {
    const file = new URL(request.url).pathname.split("/main/")[1];
    return files.has(file)
        ? new Response(files.get(file), { status: 200 })
        : new Response("missing", { status: 404 });
};

test("serves normal HTML without JavaScript or browser negotiation", async () => {
    const response = await handle(new Request("https://fgoiriz.com/"));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
    assert.match(await response.text(), /Home/);
});

test("serves Markdown and cache-safe Vary headers", async () => {
    const response = await handle(new Request("https://fgoiriz.com/", {
        headers: { Accept: "text/markdown, text/html;q=0.5" },
    }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/markdown; charset=utf-8");
    assert.equal(response.headers.get("vary"), "Accept, Accept-Encoding");
    assert.equal(await response.text(), "# Profile");
});

test("honors q-values and serves HTML when it is preferred", async () => {
    const response = await handle(new Request("https://fgoiriz.com/about", {
        headers: { Accept: "text/html, text/markdown;q=0.5" },
    }));
    assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
    assert.match(await response.text(), /About/);
});

test("uses specificity before a Markdown tie", async () => {
    const response = await handle(new Request("https://fgoiriz.com/", {
        headers: { Accept: "text/*;q=1, text/html;q=1" },
    }));
    assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
});

test("returns a useful Markdown 404 with a real 404 status", async () => {
    const response = await handle(new Request("https://fgoiriz.com/missing", {
        headers: { Accept: "text/markdown" },
    }));
    assert.equal(response.status, 404);
    assert.match(await response.text(), /Site map/);
    assert.equal(response.headers.get("vary"), "Accept, Accept-Encoding");
});

test("returns the custom HTML page with a real 404 status", async () => {
    const response = await handle(new Request("https://fgoiriz.com/missing"));
    assert.equal(response.status, 404);
    assert.match(await response.text(), /Page not found/);
});

test("returns 406 when no supported representation is acceptable", async () => {
    const response = await handle(new Request("https://fgoiriz.com/", {
        headers: { Accept: "application/json" },
    }));
    assert.equal(response.status, 406);
});

test("does not treat a browser wildcard as a Markdown request", async () => {
    const response = await handle(new Request("https://fgoiriz.com/styles.css", {
        headers: { Accept: "text/css,*/*;q=0.1" },
    }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/css; charset=utf-8");
});

test("does not relabel non-HTML assets as Markdown", async () => {
    const response = await handle(new Request("https://fgoiriz.com/styles.css", {
        headers: { Accept: "text/markdown" },
    }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/css; charset=utf-8");
});

test("serves native files for their own Accept type", async () => {
    files.set("sitemap.xml", "<urlset />");
    const response = await handle(new Request("https://fgoiriz.com/sitemap.xml", {
        headers: { Accept: "application/xml" },
    }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/xml; charset=utf-8");
});

test("does not cache upstream failures as missing pages", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("failure", { status: 503 });
    const response = await handle(new Request("https://fgoiriz.com/styles.css"));
    globalThis.fetch = originalFetch;
    assert.equal(response.status, 502);
    assert.equal(response.headers.get("cache-control"), "no-store");
});
