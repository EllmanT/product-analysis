/** Image CDN base — must stay on `images.unsplash.com` (see next.config remotePatterns). */
const W400 = "?w=400";

/** FNV-1a 32-bit: stable index from product identity so the same SKU always gets the same image. */
function stableIndex(seed: string, mod: number): number {
  if (mod <= 0) return 0;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % mod;
}

function pick(urls: string[], name: string, standardCode: string): string {
  return urls[stableIndex(`${standardCode}|${name}`, urls.length)];
}

const DEFAULT_IMAGE_URLS: string[] = [
  `https://images.unsplash.com/photo-1553484771-371a605b060b${W400}`,
  `https://images.unsplash.com/photo-1518770660439-4636190af475${W400}`,
  `https://images.unsplash.com/photo-1621905252507-b35492cc74b4${W400}`,
  `https://images.unsplash.com/photo-1504148455328-c376907d081c${W400}`,
  `https://images.unsplash.com/photo-1572981779307-38b8cabb2407${W400}`,
  `https://images.unsplash.com/photo-1581092160562-40aa08e78837${W400}`,
  `https://images.unsplash.com/photo-1581578731548-c64695cc6952${W400}`,
  `https://images.unsplash.com/photo-1544724569-5f546fd6f2b5${W400}`,
];

const KEYWORD_RULES: { keywords: string[]; urls: string[] }[] = [
  {
    keywords: ["cable", "wire", "conductor"],
    urls: [
      `https://images.unsplash.com/photo-1621905252507-b35492cc74b4${W400}`,
      `https://images.unsplash.com/photo-1725304067445-60b4061d9992${W400}`,
      `https://images.unsplash.com/photo-1678295630775-f5b1587cdfef${W400}`,
      `https://images.unsplash.com/photo-1775714351784-51e93e4c12a7${W400}`,
      `https://images.unsplash.com/photo-1607631755187-298a3f9a640a${W400}`,
      `https://images.unsplash.com/photo-1650698877967-734f036a0c08${W400}`,
      `https://images.unsplash.com/photo-1776062157223-5bc78f5b893b${W400}`,
      `https://images.unsplash.com/photo-1763741217923-dbd5877c1bb7${W400}`,
    ],
  },
  {
    keywords: ["switch", "socket", "plug", "outlet"],
    urls: [
      `https://images.unsplash.com/photo-1565049981953-379c9c2a5d48${W400}`,
      `https://images.unsplash.com/photo-1610056494071-9373f12bf769${W400}`,
      `https://images.unsplash.com/photo-1529111316-da2e2a1e625d${W400}`,
      `https://images.unsplash.com/photo-1508920291026-c344bbfca1ab${W400}`,
      `https://images.unsplash.com/photo-1767514536575-82aaf8b0afc4${W400}`,
      `https://images.unsplash.com/photo-1761479373576-ad4c1c5bb9af${W400}`,
      `https://images.unsplash.com/photo-1635335874521-7987db781153${W400}`,
      `https://images.unsplash.com/photo-1762330464388-de535963b42e${W400}`,
    ],
  },
  {
    keywords: ["light", "lamp", "bulb", "led", "fluorescent"],
    urls: [
      `https://images.unsplash.com/photo-1529310399831-ed472b81d589${W400}`,
      `https://images.unsplash.com/photo-1531379410502-63bfe8cdaf6f${W400}`,
      `https://images.unsplash.com/photo-1573621622238-f7ac6ac0429a${W400}`,
      `https://images.unsplash.com/photo-1493612276216-ee3925520721${W400}`,
      `https://images.unsplash.com/photo-1552862750-746b8f6f7f25${W400}`,
      `https://images.unsplash.com/photo-1495291916458-c12f594151e7${W400}`,
      `https://images.unsplash.com/photo-1513518647365-91830a8800b3${W400}`,
      `https://images.unsplash.com/photo-1448745799564-e2c1ed534c94${W400}`,
    ],
  },
  {
    keywords: ["solar", "panel", "flood"],
    urls: [
      `https://images.unsplash.com/photo-1509391366360-2e959784a276${W400}`,
      `https://images.unsplash.com/photo-1558449028-b53a39d100fc${W400}`,
      `https://images.unsplash.com/photo-1724041875334-0a6397111c7e${W400}`,
      `https://images.unsplash.com/photo-1508514177221-188b1cf16e9d${W400}`,
      `https://images.unsplash.com/photo-1613665813446-82a78c468a1d${W400}`,
      `https://images.unsplash.com/photo-1658298775754-5839ffd434cc${W400}`,
      `https://images.unsplash.com/photo-1521618755572-156ae0cdd74d${W400}`,
      `https://images.unsplash.com/photo-1660330589257-813305a4a383${W400}`,
    ],
  },
  {
    keywords: ["pump", "water"],
    urls: [
      `https://images.unsplash.com/photo-1774019883068-128d688b3b0c${W400}`,
      `https://images.unsplash.com/photo-1768779611359-c4bb38ba3c1e${W400}`,
      `https://images.unsplash.com/photo-1774019883037-91f5d43e2890${W400}`,
      `https://images.unsplash.com/photo-1774019883172-a89730a86500${W400}`,
      `https://images.unsplash.com/photo-1759692072150-166d6387c616${W400}`,
      `https://images.unsplash.com/photo-1746907168464-f61a24a283ca${W400}`,
      `https://images.unsplash.com/photo-1772588047051-c35d272b5d9c${W400}`,
      `https://images.unsplash.com/photo-1760776066784-dfe3e7b45b3b${W400}`,
    ],
  },
  {
    keywords: ["meter", "board"],
    urls: [
      `https://images.unsplash.com/photo-1544724569-5f546fd6f2b5${W400}`,
      `https://images.unsplash.com/photo-1576446470246-499c738d1c8e${W400}`,
      `https://images.unsplash.com/photo-1652715564391-38cc4475b7f5${W400}`,
      `https://images.unsplash.com/photo-1607631697491-61972eecf928${W400}`,
      `https://images.unsplash.com/photo-1558054665-fbe00cd7d920${W400}`,
      `https://images.unsplash.com/photo-1661864359698-fcfe5fef9917${W400}`,
      `https://images.unsplash.com/photo-1566417110090-6b15a06ec800${W400}`,
      `https://images.unsplash.com/photo-1558002038-1055907df827${W400}`,
    ],
  },
  {
    keywords: ["conduit", "pipe", "fitting", "gland"],
    urls: [
      `https://images.unsplash.com/photo-1742858046408-45953cab801e${W400}`,
      `https://images.unsplash.com/photo-1528383785039-e8af7bedf381${W400}`,
      `https://images.unsplash.com/photo-1646009445351-b8192e095f3a${W400}`,
      `https://images.unsplash.com/photo-1737574990049-264694ce17a0${W400}`,
      `https://images.unsplash.com/photo-1709804572415-03d2570a2d01${W400}`,
      `https://images.unsplash.com/photo-1649706286480-1c6f3f3c1fb1${W400}`,
      `https://images.unsplash.com/photo-1546605213-771ae5978311${W400}`,
      `https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1${W400}`,
    ],
  },
  {
    keywords: ["screw", "nail", "bolt", "nut", "washer", "ferule"],
    urls: [
      `https://images.unsplash.com/photo-1631342816586-30462a1d30d0${W400}`,
      `https://images.unsplash.com/photo-1704732061018-3ac738176c20${W400}`,
      `https://images.unsplash.com/photo-1704732060817-b62414c6004c${W400}`,
      `https://images.unsplash.com/photo-1593307315564-c96172dc89dc${W400}`,
      `https://images.unsplash.com/photo-1655927858183-fe31d5dd1080${W400}`,
      `https://images.unsplash.com/photo-1776361460587-e5f9396ebf88${W400}`,
      `https://images.unsplash.com/photo-1769971361807-1e3d025c2abb${W400}`,
      `https://images.unsplash.com/photo-1576115081906-b15927fb959e${W400}`,
    ],
  },
  {
    keywords: [
      "tool",
      "drill",
      "hammer",
      "wrench",
      "plier",
      "spanner",
      "grinder",
      "saw",
    ],
    urls: [
      `https://images.unsplash.com/photo-1504148455328-c376907d081c${W400}`,
      `https://images.unsplash.com/photo-1530124566582-a618bc2615dc${W400}`,
      `https://images.unsplash.com/photo-1522832712787-3fbd36c9fe2d${W400}`,
      `https://images.unsplash.com/photo-1505582866941-6788e0205dd2${W400}`,
      `https://images.unsplash.com/photo-1590880795696-20c7dfadacde${W400}`,
      `https://images.unsplash.com/photo-1657834713969-6592efed8913${W400}`,
      `https://images.unsplash.com/photo-1616103755330-53688ce1c14b${W400}`,
      `https://images.unsplash.com/photo-1605713839000-5e2444b92f14${W400}`,
    ],
  },
  {
    keywords: [
      "capacitor",
      "contactor",
      "transformer",
      "breaker",
      "fuse",
    ],
    urls: [
      `https://images.unsplash.com/photo-1518770660439-4636190af475${W400}`,
      `https://images.unsplash.com/photo-1621905251918-48416bd8575a${W400}`,
      `https://images.unsplash.com/photo-1544724569-5f546fd6f2b5${W400}`,
      `https://images.unsplash.com/photo-1576446470246-499c738d1c8e${W400}`,
      `https://images.unsplash.com/photo-1558002038-1055907df827${W400}`,
      `https://images.unsplash.com/photo-1607631697491-61972eecf928${W400}`,
      `https://images.unsplash.com/photo-1661864359698-fcfe5fef9917${W400}`,
      `https://images.unsplash.com/photo-1566417110090-6b15a06ec800${W400}`,
    ],
  },
  {
    keywords: ["tape", "glue", "cement", "solvent"],
    urls: [
      `https://images.unsplash.com/photo-1575846250428-cffcf571b04e${W400}`,
      `https://images.unsplash.com/photo-1536356915696-c6bf1c01da46${W400}`,
      `https://images.unsplash.com/photo-1577783962414-a36fa2188247${W400}`,
      `https://images.unsplash.com/photo-1745184960919-ff06316c9ea4${W400}`,
      `https://images.unsplash.com/photo-1452860606245-08befc0ff44b${W400}`,
      `https://images.unsplash.com/photo-1745184945831-dab513e981d5${W400}`,
      `https://images.unsplash.com/photo-1636813295906-ae7bdf299931${W400}`,
      `https://images.unsplash.com/photo-1769029271123-7c7c68e76842${W400}`,
    ],
  },
  {
    keywords: ["lock", "padlock", "key"],
    urls: [
      `https://images.unsplash.com/photo-1614064641938-3bbee52942c7${W400}`,
      `https://images.unsplash.com/photo-1635602739175-bab409a6e94c${W400}`,
      `https://images.unsplash.com/photo-1508345228704-935cc84bf5e2${W400}`,
      `https://images.unsplash.com/photo-1633265486064-086b219458ec${W400}`,
      `https://images.unsplash.com/photo-1614064745490-83abb17303e1${W400}`,
      `https://images.unsplash.com/photo-1614797091730-e2a6121aaa60${W400}`,
      `https://images.unsplash.com/photo-1618588845382-4267677cfc11${W400}`,
      `https://images.unsplash.com/photo-1558618047-3c8c76ca7d13${W400}`,
    ],
  },
  {
    keywords: ["paint", "brush"],
    urls: [
      `https://images.unsplash.com/photo-1585676737728-432f58d5fdba${W400}`,
      `https://images.unsplash.com/photo-1670940094923-6f75e4dc5c3a${W400}`,
      `https://images.unsplash.com/photo-1623944361530-8a6cd3eb0de8${W400}`,
      `https://images.unsplash.com/photo-1629397545188-cf2da30db99b${W400}`,
      `https://images.unsplash.com/photo-1709487491343-9ff157175b5b${W400}`,
      `https://images.unsplash.com/photo-1623835255306-868c63d9335e${W400}`,
      `https://images.unsplash.com/photo-1709487364429-50458e975037${W400}`,
      `https://images.unsplash.com/photo-1589939705384-5185137a7f0f${W400}`,
    ],
  },
];

/**
 * Returns a product image URL from keyword rules (first matching rule wins).
 * Within each rule, picks a stable image from a pool so different SKUs get variety.
 */
export function assignProductImage(name: string, standardCode: string): string {
  const haystack = `${name} ${standardCode}`.toLowerCase();
  for (const rule of KEYWORD_RULES) {
    for (const kw of rule.keywords) {
      if (haystack.includes(kw)) {
        return pick(rule.urls, name, standardCode);
      }
    }
  }
  return pick(DEFAULT_IMAGE_URLS, name, standardCode);
}
