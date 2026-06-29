#!/usr/bin/env python3
import gzip
import html
import json
import re
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


API_URL = "https://liquipedia.net/dota2/api.php"
TOURNAMENT_PAGE = "The_International/2026"
SOURCE_URL = "https://liquipedia.net/dota2/The_International/2026"
OUT_PATH = Path(__file__).resolve().parents[1] / "public" / "data" / "players.json"
USER_AGENT = "TI2026PlayersTrainer/1.0 (https://github.com/ti2026-players-trainer; educational static site)"
REQUEST_DELAY_SECONDS = 2.1
MAX_TITLES_PER_REQUEST = 45

ROLE_LABELS = {
    "1": "Carry",
    "2": "Mid",
    "3": "Offlane",
    "4": "Soft support",
    "5": "Hard support",
    "coach": "Coach",
    "assistant coach": "Assistant coach",
}

INFO_LABELS = {
    "id": "ID",
    "ids": "Aliases",
    "name": "Name",
    "romanized_name": "Romanized",
    "givenname": "Given name",
    "familyname": "Family name",
    "country": "Country",
    "birth_date": "Birth date",
    "team": "Team",
    "roles": "Roles",
    "status": "Status",
    "hero": "Hero 1",
    "hero2": "Hero 2",
    "hero3": "Hero 3",
    "instagram": "Instagram",
    "twitch": "Twitch",
    "twitter": "Twitter",
    "vk": "VK",
    "weibo": "Weibo",
    "facebook": "Facebook",
    "youtube": "YouTube",
    "playerid": "Player ID",
    "signature": "Signature",
}


class LiquipediaClient:
    def __init__(self):
        self.opener = urllib.request.build_opener()
        self.last_request = 0.0

    def get(self, params):
        elapsed = time.monotonic() - self.last_request
        if elapsed < REQUEST_DELAY_SECONDS:
            time.sleep(REQUEST_DELAY_SECONDS - elapsed)

        query = urllib.parse.urlencode(params)
        request = urllib.request.Request(
            f"{API_URL}?{query}",
            headers={
                "User-Agent": USER_AGENT,
                "Accept-Encoding": "gzip",
                "Accept": "application/json",
            },
        )
        with self.opener.open(request, timeout=45) as response:
            raw = response.read()
            if response.headers.get("Content-Encoding", "").lower() == "gzip":
                raw = gzip.decompress(raw)
            self.last_request = time.monotonic()
            return json.loads(raw.decode("utf-8"))


def strip_comments(text):
    return re.sub(r"<!--.*?-->", "", text or "", flags=re.S)


def find_template(text, name):
    pattern = re.compile(r"\{\{\s*" + re.escape(name) + r"(?=[\s|}])", re.I)
    match = pattern.search(text or "")
    if not match:
        return ""

    index = match.start()
    depth = 0
    i = index
    while i < len(text) - 1:
        pair = text[i : i + 2]
        if pair == "{{":
            depth += 1
            i += 2
            continue
        if pair == "}}":
            depth -= 1
            i += 2
            if depth == 0:
                return text[index:i]
            continue
        i += 1
    return ""


def split_top_level(text, separator="|"):
    parts = []
    start = 0
    template_depth = 0
    link_depth = 0
    i = 0
    while i < len(text):
        pair = text[i : i + 2]
        if pair == "{{":
            template_depth += 1
            i += 2
            continue
        if pair == "}}" and template_depth:
            template_depth -= 1
            i += 2
            continue
        if pair == "[[":
            link_depth += 1
            i += 2
            continue
        if pair == "]]" and link_depth:
            link_depth -= 1
            i += 2
            continue
        if text[i] == separator and template_depth == 0 and link_depth == 0:
            parts.append(text[start:i])
            start = i + 1
        i += 1
    parts.append(text[start:])
    return parts


def find_top_level_equal(text):
    template_depth = 0
    link_depth = 0
    i = 0
    while i < len(text):
        pair = text[i : i + 2]
        if pair == "{{":
            template_depth += 1
            i += 2
            continue
        if pair == "}}" and template_depth:
            template_depth -= 1
            i += 2
            continue
        if pair == "[[":
            link_depth += 1
            i += 2
            continue
        if pair == "]]" and link_depth:
            link_depth -= 1
            i += 2
            continue
        if text[i] == "=" and template_depth == 0 and link_depth == 0:
            return i
        i += 1
    return -1


def parse_template(template):
    template = strip_comments(template).strip()
    if not (template.startswith("{{") and template.endswith("}}")):
        return "", [], {}
    inner = template[2:-2].strip()
    parts = split_top_level(inner)
    name = parts[0].strip()
    positional = []
    named = {}
    for part in parts[1:]:
        eq = find_top_level_equal(part)
        if eq > -1:
            key = part[:eq].strip().lower()
            named[key] = part[eq + 1 :].strip()
        else:
            positional.append(part.strip())
    return name, positional, named


def clean_wikitext(value):
    value = strip_comments(value)
    value = value.replace("{{!}}", "|")
    value = re.sub(r"<ref\b[^>]*>.*?</ref>", "", value, flags=re.I | re.S)
    value = re.sub(r"<[^>]+>", "", value)
    value = re.sub(r"\[\[([^|\]]+)\|([^\]]+)\]\]", r"\2", value)
    value = re.sub(r"\[\[([^\]]+)\]\]", r"\1", value)

    def template_repl(match):
        _, positional, named = parse_template(match.group(0))
        if positional:
            return clean_wikitext(positional[-1])
        if named:
            return clean_wikitext(next(iter(named.values())))
        return ""

    previous = None
    while previous != value:
        previous = value
        value = re.sub(r"\{\{[^{}]*\}\}", template_repl, value)

    value = value.replace("'''", "").replace("''", "")
    value = html.unescape(value)
    value = re.sub(r"\s+", " ", value).strip(" \n\t,")
    return value


def slugify(*parts):
    value = "-".join(clean_wikitext(part).lower() for part in parts if part)
    value = re.sub(r"[^a-z0-9а-яё]+", "-", value, flags=re.I)
    return value.strip("-") or "person"


def profile_url(title):
    quoted = urllib.parse.quote(title.replace(" ", "_"), safe="/():")
    return f"https://liquipedia.net/dota2/{quoted}"


def fetch_wikitext(client, titles):
    result = {}
    for offset in range(0, len(titles), MAX_TITLES_PER_REQUEST):
        batch = titles[offset : offset + MAX_TITLES_PER_REQUEST]
        data = client.get(
            {
                "action": "query",
                "prop": "revisions",
                "rvprop": "content",
                "rvslots": "main",
                "titles": "|".join(batch),
                "redirects": "1",
                "format": "json",
                "formatversion": "2",
            }
        )
        normalized = {item["from"]: item["to"] for item in data.get("query", {}).get("normalized", [])}
        redirects = {item["from"]: item["to"] for item in data.get("query", {}).get("redirects", [])}
        pages = {}
        for page in data.get("query", {}).get("pages", []):
            content = ""
            revisions = page.get("revisions") or []
            if revisions:
                content = revisions[0].get("slots", {}).get("main", {}).get("content", "")
            pages[page.get("title", "")] = {
                "title": page.get("title", ""),
                "content": content,
                "missing": "missing" in page,
            }
        for original in batch:
            title = normalized.get(original, original)
            title = redirects.get(title, title)
            result[original] = pages.get(title, {"title": title, "content": "", "missing": True})
    return result


def fetch_imageinfo(client, files):
    result = {}
    clean_files = [file for file in files if file]
    for offset in range(0, len(clean_files), MAX_TITLES_PER_REQUEST):
        batch = clean_files[offset : offset + MAX_TITLES_PER_REQUEST]
        titles = [f"File:{file.replace('_', ' ')}" for file in batch]
        data = client.get(
            {
                "action": "query",
                "prop": "imageinfo",
                "iiprop": "url|mime|extmetadata",
                "iiurlwidth": "600",
                "titles": "|".join(titles),
                "format": "json",
                "formatversion": "2",
            }
        )
        by_title = {}
        for page in data.get("query", {}).get("pages", []):
            title = page.get("title", "")
            info = (page.get("imageinfo") or [{}])[0]
            key = title.replace("File:", "").replace(" ", "_")
            by_title[key.lower()] = {
                "file": title.replace("File:", ""),
                "url": info.get("thumburl") or info.get("url") or "",
                "fullUrl": info.get("url") or "",
                "descriptionUrl": info.get("descriptionurl") or "",
                "mime": info.get("mime") or "",
            }
        for original in batch:
            key = original.replace(" ", "_")
            result[original] = by_title.get(key.lower()) or by_title.get(original.lower()) or {
                "file": original,
                "url": "",
                "fullUrl": "",
                "descriptionUrl": "",
                "mime": "",
            }
    return result


def fetch_page_images(client, titles):
    result = {}
    for offset in range(0, len(titles), MAX_TITLES_PER_REQUEST):
        batch = titles[offset : offset + MAX_TITLES_PER_REQUEST]
        data = client.get(
            {
                "action": "query",
                "prop": "images",
                "titles": "|".join(batch),
                "redirects": "1",
                "imlimit": "500",
                "format": "json",
                "formatversion": "2",
            }
        )
        normalized = {item["from"]: item["to"] for item in data.get("query", {}).get("normalized", [])}
        redirects = {item["from"]: item["to"] for item in data.get("query", {}).get("redirects", [])}
        pages = {
            page.get("title", ""): [
                image.get("title", "").replace("File:", "")
                for image in page.get("images", [])
                if image.get("title", "").startswith("File:")
            ]
            for page in data.get("query", {}).get("pages", [])
        }
        for original in batch:
            title = normalized.get(original, original)
            title = redirects.get(title, title)
            result[original] = pages.get(title, [])
    return result


def normalized_token(value):
    return re.sub(r"[^a-z0-9а-яё]+", "", (value or "").lower(), flags=re.I)


def image_candidate_score(filename, participant, info):
    lower = filename.lower()
    bad_keywords = [
        " allmode",
        "_allmode",
        "darkmode",
        "lightmode",
        " icon ",
        "_icon_",
        " icon.",
        " mapicon",
        "gameasset",
        " logo",
        "_logo",
        " hd.",
        "_hd.",
        "aegis",
        "filler",
        "emblem",
        "default",
        "small.",
        "trophy",
    ]
    if any(keyword in lower for keyword in bad_keywords):
        return -1

    file_token = normalized_token(filename)
    raw_tokens = [
        participant.get("nickname", ""),
        participant.get("profileTitle", ""),
        info.get("id", ""),
        info.get("ids", ""),
        info.get("romanized_name", ""),
        info.get("givenname", ""),
        info.get("familyname", ""),
    ]
    tokens = []
    for raw in raw_tokens:
        for token in re.split(r"[,/()\s]+", raw):
            token = normalized_token(token)
            if len(token) >= 3:
                tokens.append(token)

    token_score = 0
    for token in set(tokens):
        if token and token in file_token:
            token_score += 100 + len(token)

    if token_score == 0:
        return 1 if lower.endswith((".jpg", ".jpeg", ".webp")) else -1

    score = token_score
    if lower.endswith((".jpg", ".jpeg", ".webp")):
        score += 12
    elif lower.endswith(".png"):
        score += 6
    return score


def choose_fallback_image(participant, info, filenames):
    scored = [
        (image_candidate_score(filename, participant, info), filename)
        for filename in filenames
    ]
    scored = [(score, filename) for score, filename in scored if score > 0]
    if not scored:
        return ""
    scored.sort(key=lambda item: (item[0], item[1]), reverse=True)
    return scored[0][1]


def parse_qualification(value):
    qualification = {
        "method": "",
        "region": "",
        "placement": "",
    }
    template = find_template(value, "Qualification")
    if template:
        _, _, named = parse_template(template)
        method = clean_wikitext(named.get("method", ""))
        text = clean_wikitext(named.get("text", ""))
        placement = clean_wikitext(named.get("placement", ""))
        qualification["method"] = method
        qualification["region"] = text or ("Invite" if method == "invite" else method.title())
        qualification["placement"] = placement
    return qualification


def parse_participants(wikitext):
    root = find_template(wikitext, "TeamParticipants")
    if not root:
        raise RuntimeError("TeamParticipants template not found")

    _, positional, named = parse_template(root)
    opponents = []
    all_parts = positional + list(named.values())
    for part in all_parts:
        opponent_template = find_template(part, "Opponent") if "Opponent" in part else ""
        if not opponent_template:
            continue
        _, opp_positional, opp_named = parse_template(opponent_template)
        team = clean_wikitext(opp_positional[0] if opp_positional else "")
        qualification = parse_qualification(opp_named.get("qualification", ""))
        players_template = find_template(opp_named.get("players", ""), "Persons")
        if not players_template:
            continue
        _, people_parts, _ = parse_template(players_template)
        for person_part in people_parts:
            person_template = find_template(person_part, "Person")
            if not person_template:
                continue
            _, person_positional, person_named = parse_template(person_template)
            nickname = clean_wikitext(person_positional[0] if person_positional else "")
            if not nickname:
                continue
            role = clean_wikitext(person_named.get("role", "")).lower()
            profile_title = clean_wikitext(person_named.get("link", "")) or nickname
            role_label = ROLE_LABELS.get(role, role.title() if role else "Role")
            opponents.append(
                {
                    "nickname": nickname,
                    "profileTitle": profile_title,
                    "team": team,
                    "role": role,
                    "roleLabel": role_label,
                    "kind": "coach" if "coach" in role else "player",
                    "qualification": qualification,
                    "region": qualification.get("region") or "Invite",
                }
            )
    return opponents


def parse_infobox(wikitext):
    template = find_template(wikitext, "Infobox player")
    if not template:
        return {}
    _, _, named = parse_template(template)
    return {key.lower(): clean_wikitext(value) for key, value in named.items()}


def build_people(participants, profiles, profile_infos, images, fallback_images):
    people = []
    used_uids = set()
    for participant in participants:
        profile = profiles.get(participant["profileTitle"], {})
        info = profile_infos.get(participant["profileTitle"], {})
        image_file = info.get("image", "") or fallback_images.get(participant["profileTitle"], "")
        image = images.get(image_file, {"file": image_file, "url": "", "descriptionUrl": ""}) if image_file else {}
        base_uid = slugify(participant["team"], participant["role"], participant["nickname"])
        uid = base_uid
        suffix = 2
        while uid in used_uids:
            uid = f"{base_uid}-{suffix}"
            suffix += 1
        used_uids.add(uid)

        info_rows = []
        for key, label in INFO_LABELS.items():
            value = info.get(key, "")
            if value and key not in {"image", "history"}:
                info_rows.append({"label": label, "value": value})

        people.append(
            {
                "uid": uid,
                "nickname": participant["nickname"],
                "profileTitle": profile.get("title") or participant["profileTitle"],
                "profileUrl": profile_url(profile.get("title") or participant["profileTitle"]),
                "team": participant["team"],
                "role": participant["role"],
                "roleLabel": participant["roleLabel"],
                "kind": participant["kind"],
                "region": participant["region"],
                "qualification": participant["qualification"],
                "name": info.get("name", ""),
                "romanizedName": info.get("romanized_name", ""),
                "country": info.get("country", ""),
                "birthDate": info.get("birth_date", ""),
                "status": info.get("status", ""),
                "aliases": info.get("ids", ""),
                "profileRoles": info.get("roles", ""),
                "image": image,
                "info": info_rows,
            }
        )
    return people


def main():
    client = LiquipediaClient()
    tournament = fetch_wikitext(client, [TOURNAMENT_PAGE])[TOURNAMENT_PAGE]["content"]
    participants = parse_participants(tournament)
    profile_titles = sorted({person["profileTitle"] for person in participants})
    profiles = fetch_wikitext(client, profile_titles)
    profile_infos = {
        title: parse_infobox(profile.get("content", ""))
        for title, profile in profiles.items()
    }
    missing_image_titles = sorted(
        {
            person["profileTitle"]
            for person in participants
            if not profile_infos.get(person["profileTitle"], {}).get("image", "")
        }
    )
    page_images = fetch_page_images(client, missing_image_titles) if missing_image_titles else {}
    fallback_images = {}
    for participant in participants:
        title = participant["profileTitle"]
        info = profile_infos.get(title, {})
        if info.get("image", ""):
            continue
        fallback_images[title] = choose_fallback_image(participant, info, page_images.get(title, []))
    image_files = sorted(
        {
            profile_infos.get(person["profileTitle"], {}).get("image", "")
            or fallback_images.get(person["profileTitle"], "")
            for person in participants
        }
        - {""}
    )
    images = fetch_imageinfo(client, image_files)
    people = build_people(participants, profiles, profile_infos, images, fallback_images)

    payload = {
        "metadata": {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "source": "Liquipedia Dota 2 Wiki",
            "sourceUrl": SOURCE_URL,
            "tournamentPage": TOURNAMENT_PAGE,
            "count": len(people),
        },
        "people": people,
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(people)} people to {OUT_PATH}")


if __name__ == "__main__":
    main()
