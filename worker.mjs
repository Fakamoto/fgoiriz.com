const RAW_ORIGIN = "https://raw.githubusercontent.com/Fakamoto/fgoiriz.com/main/";

const HTML_PATHS = new Map([
    ["/", "index.html"],
    ["/about", "about/index.html"],
    ["/about/", "about/index.html"],
    ["/contact", "contact/index.html"],
    ["/contact/", "contact/index.html"],
    ["/privacy", "privacy/index.html"],
    ["/privacy/", "privacy/index.html"],
    ["/404.html", "404.html"],
]);

const MARKDOWN_PATHS = new Map([
    ["/", "profile.md"],
    ["/about", "about/index.md"],
    ["/about/", "about/index.md"],
    ["/contact", "contact/index.md"],
    ["/contact/", "contact/index.md"],
    ["/privacy", "privacy/index.md"],
    ["/privacy/", "privacy/index.md"],
]);

const CONTENT_TYPES = new Map([
    [".css", "text/css; charset=utf-8"],
    [".html", "text/html; charset=utf-8"],
    [".jpg", "image/jpeg"],
    [".js", "text/javascript; charset=utf-8"],
    [".md", "text/markdown; charset=utf-8"],
    [".pdf", "application/pdf"],
    [".txt", "text/plain; charset=utf-8"],
    [".xml", "application/xml; charset=utf-8"],
]);

function preference(accept, type) {
    let best = { q: 0, specificity: -1, index: Infinity };

    for (const [index, part] of accept.toLowerCase().split(",").entries()) {
        const [range, ...parameters] = part.trim().split(";");
        const matches = range === type || (range === "*/*" && type === "text/html") || (range === "text/*" && type.startsWith("text/"));
        if (!matches) continue;

        const currentSpecificity = range === type ? 2 : range.endsWith("/*") ? 1 : 0;
        if (currentSpecificity < best.specificity) continue;

        const q = Number(parameters.find(value => value.trim().startsWith("q="))?.trim().slice(2) ?? 1);
        if (currentSpecificity > best.specificity || q > best.q) {
            best = { q: Number.isFinite(q) ? q : 0, specificity: currentSpecificity, index };
        }
    }

    return best;
}

function representation(accept) {
    if (!accept || accept.trim() === "*/*") return "html";
    const markdown = preference(accept, "text/markdown");
    const html = preference(accept, "text/html");
    if (markdown.q <= 0 && html.q <= 0) return "unacceptable";
    if (markdown.q !== html.q) return markdown.q > html.q ? "markdown" : "html";
    if (markdown.specificity !== html.specificity) return markdown.specificity > html.specificity ? "markdown" : "html";
    if (markdown.index !== html.index) return markdown.index < html.index ? "markdown" : "html";
    if (markdown.q > 0) return "markdown";
    return "unacceptable";
}

function fileFor(pathname) {
    if (HTML_PATHS.has(pathname)) return HTML_PATHS.get(pathname);
    const path = pathname.replace(/^\//, "");
    return path && !path.includes("..") ? path : null;
}

function contentType(file) {
    const extension = file.slice(file.lastIndexOf("."));
    return CONTENT_TYPES.get(extension) ?? "application/octet-stream";
}

async function raw(file) {
    return fetch(new Request(RAW_ORIGIN + file, { headers: { Accept: "*/*" } }));
}

function response(body, status, type, method, cacheControl = "public, max-age=300") {
    const headers = new Headers({
        "Cache-Control": cacheControl,
        "Content-Type": type,
        "Vary": "Accept, Accept-Encoding",
        "X-Content-Type-Options": "nosniff",
    });
    return new Response(method === "HEAD" ? null : body, { status, headers });
}

export async function handle(request) {
    const url = new URL(request.url);
    const hasVariants = MARKDOWN_PATHS.has(url.pathname);
    const requested = representation(request.headers.get("Accept"));
    const selected = hasVariants ? requested : "html";

    if (selected === "unacceptable") {
        return response("# Not acceptable\n\nRequest HTML or Markdown.\n", 406, "text/markdown; charset=utf-8", request.method);
    }

    if (selected === "markdown" && MARKDOWN_PATHS.has(url.pathname)) {
        const source = await raw(MARKDOWN_PATHS.get(url.pathname));
        if (!source.ok) {
            return response("# Upstream unavailable\n", 502, "text/markdown; charset=utf-8", request.method, "no-store");
        }
        return response(source.body, 200, "text/markdown; charset=utf-8", request.method);
    }

    const file = fileFor(url.pathname);
    const source = file ? await raw(file) : new Response(null, { status: 404 });
    if (source.ok) {
        return response(source.body, 200, contentType(file), request.method);
    }

    if (source.status !== 404) {
        return response("Upstream unavailable\n", 502, "text/plain; charset=utf-8", request.method, "no-store");
    }

    if (requested === "markdown") {
        const body = "# Page not found\n\nThe requested page does not exist.\n\n- [Homepage](https://fgoiriz.com/)\n- [Site map](https://fgoiriz.com/sitemap.xml)\n- [Agent guide](https://fgoiriz.com/llms.txt)\n- [About](https://fgoiriz.com/about/)\n- [Contact](https://fgoiriz.com/contact/)\n";
        return response(body, 404, "text/markdown; charset=utf-8", request.method);
    }

    const notFound = await raw("404.html");
    return response(notFound.body, 404, "text/html; charset=utf-8", request.method);
}

export default { fetch: handle };
