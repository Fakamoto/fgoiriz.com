import json
import re
import unittest
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).parents[1]


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.hidden = 0
        self.headings = []
        self.links = []
        self.text = []

    def handle_starttag(self, tag, attrs):
        if tag in {"head", "script", "style"}:
            self.hidden += 1
        if re.fullmatch(r"h[1-6]", tag):
            self.headings.append(int(tag[1]))
        if tag == "a":
            href = dict(attrs).get("href")
            if href:
                self.links.append(href)

    def handle_endtag(self, tag):
        if tag in {"head", "script", "style"}:
            self.hidden -= 1

    def handle_data(self, data):
        if not self.hidden and data.strip():
            self.text.append(data.strip())


def parse(path):
    parser = PageParser()
    parser.feed(path.read_text())
    return parser


class SiteContractTests(unittest.TestCase):
    def test_homepage_is_agent_readable_without_javascript(self):
        path = ROOT / "index.html"
        parser = parse(path)
        visible = " ".join(parser.text)
        self.assertGreaterEqual(len(visible), 500)
        self.assertEqual(parser.headings[0], 1)
        self.assertIn(2, parser.headings)
        self.assertIn(3, parser.headings)
        self.assertGreater(len(visible) / len(path.read_text()), 0.05)
        self.assertIn("Facundo Goiriz", visible)

    def test_organization_schema_has_contact_and_address(self):
        html = (ROOT / "index.html").read_text()
        payload = re.search(r'<script type="application/ld\+json">\s*(.*?)\s*</script>', html, re.S)
        self.assertIsNotNone(payload)
        graph = json.loads(payload.group(1))["@graph"]
        organization = next(node for node in graph if "Organization" in node.get("@type", []))
        self.assertIn("contactPoint", organization)
        self.assertIn("email", organization["contactPoint"])
        self.assertEqual(organization["address"]["@type"], "PostalAddress")
        self.assertEqual(organization["address"]["addressCountry"], "AR")

    def test_trust_pages_are_substantial_and_semantic(self):
        for name in ("about", "contact", "privacy"):
            with self.subTest(page=name):
                path = ROOT / name / "index.html"
                parser = parse(path)
                self.assertGreaterEqual(len(" ".join(parser.text)), 500)
                self.assertEqual(parser.headings[0], 1)
                self.assertIn(2, parser.headings)
                self.assertTrue((ROOT / name / "index.md").is_file())

    def test_agent_friendly_404_has_recovery_links(self):
        parser = parse(ROOT / "404.html")
        self.assertEqual(parser.headings[0], 1)
        for target in ("/", "/sitemap.xml", "/llms.txt", "/about/", "/contact/"):
            self.assertIn(target, parser.links)

    def test_llms_txt_follows_v2_shape_and_has_use_guidance(self):
        lines = (ROOT / "llms.txt").read_text().splitlines()
        self.assertTrue(lines[0].startswith("# "))
        self.assertEqual(sum(line.startswith("# ") for line in lines), 1)
        first_h2 = next(index for index, line in enumerate(lines) if line.startswith("## "))
        self.assertIn("When to use", "\n".join(lines[:first_h2]))
        for index, line in enumerate(lines):
            if line.startswith("## "):
                section = []
                for candidate in lines[index + 1:]:
                    if candidate.startswith("## "):
                        break
                    if candidate.strip():
                        section.append(candidate)
                self.assertTrue(section)
                self.assertTrue(all(item.startswith("- [") for item in section))

    def test_sitemap_lists_all_canonical_resources(self):
        root = ET.parse(ROOT / "sitemap.xml").getroot()
        urls = {node.text for node in root.findall("{*}url/{*}loc")}
        for path in ("/", "/llms.txt", "/profile.md", "/about/", "/contact/", "/privacy/"):
            self.assertIn("https://fgoiriz.com" + path, urls)


if __name__ == "__main__":
    unittest.main()
