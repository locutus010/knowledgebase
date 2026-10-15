from kb import markdown_io as mio


def test_front_matter_roundtrip():
    text = mio.render_md({"title": "Über uns", "tags": ["a", "b"]}, "# Hallo\n")
    meta, body = mio.parse_md(text)
    assert meta == {"title": "Über uns", "tags": ["a", "b"]}
    assert body == "# Hallo\n"


def test_parse_without_front_matter():
    assert mio.parse_md("Nur Text") == ({}, "Nur Text")


def test_broken_front_matter_is_treated_as_text():
    text = "---\n: : :\n---\nRest"
    meta, body = mio.parse_md(text)
    assert meta == {}
    assert body == text


def test_safe_name():
    assert mio.safe_name('a/b:c*?"<>|') == "a-b-c"
    assert mio.safe_name("   ") == "Seite"
    assert mio.safe_name("CON") == "CON-"


def test_unsafe_zip_paths():
    for bad in ("../x.md", "/etc/x.md", "a/../../x.md", "C:/x.md", "a\\..\\x.md"):
        assert not mio.is_safe_path(bad), bad
    for good in ("a/b.md", "Ordner mit Leerzeichen/Ä.md"):
        assert mio.is_safe_path(good)
