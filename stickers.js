// Chill — wbudowany zestaw naklejek.
// Wszystkie grafiki są lokalnymi SVG (bez internetu, bez zewnętrznych licencji).
(function (root) {
  'use strict';

  const INK = '#2b2438';
  const OUT = 'stroke="#ffffff" stroke-width="12" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke"';
  const FINE = 'stroke="#ffffff" stroke-width="7" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke"';

  function svg(body) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240">${body}</svg>`;
  }

  function circle(cx, cy, r, fill, extra = '') {
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${OUT}${extra ? ` ${extra}` : ''}/>`;
  }

  function ellipse(cx, cy, rx, ry, fill, extra = '') {
    return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" ${OUT}${extra ? ` ${extra}` : ''}/>`;
  }

  function path(d, fill, extra = '') {
    return `<path d="${d}" fill="${fill}" ${OUT}${extra ? ` ${extra}` : ''}/>`;
  }

  function line(d, color = INK, width = 7, extra = '') {
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${extra ? ` ${extra}` : ''}/>`;
  }

  function dot(cx, cy, r, fill = INK) {
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;
  }

  function glint(cx, cy, r = 2.2) {
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff" opacity="0.92"/>`;
  }

  function face(fill, cy = 100, r = 70) {
    return `${circle(120, cy, r, fill)}<ellipse cx="92" cy="${cy - 38}" rx="24" ry="13" fill="#ffffff" opacity="0.2" transform="rotate(-25 92 ${cy - 38})"/>`;
  }

  function eyes(y = 92, dx = 25, r = 6.5) {
    return `${dot(120 - dx, y, r)}${glint(120 - dx + 2, y - 2)}${dot(120 + dx, y, r)}${glint(120 + dx + 2, y - 2)}`;
  }

  function eyesHappy(y = 93, dx = 25) {
    return `${line(`M${120 - dx - 10} ${y} Q${120 - dx} ${y - 10} ${120 - dx + 10} ${y}`, INK, 6.5)}`
      + `${line(`M${120 + dx - 10} ${y} Q${120 + dx} ${y - 10} ${120 + dx + 10} ${y}`, INK, 6.5)}`;
  }

  function eyesWide(y = 90, dx = 25) {
    return `${circle(120 - dx, y, 13, '#ffffff')}${circle(120 + dx, y, 13, '#ffffff')}`
      + `${dot(120 - dx, y + 2, 5.5)}${dot(120 + dx, y + 2, 5.5)}`
      + `${glint(120 - dx + 2, y - 1, 1.8)}${glint(120 + dx + 2, y - 1, 1.8)}`;
  }

  function blush(y = 118, dx = 47) {
    return `<circle cx="${120 - dx}" cy="${y}" r="9" fill="#ff8fa8" opacity="0.62"/><circle cx="${120 + dx}" cy="${y}" r="9" fill="#ff8fa8" opacity="0.62"/>`;
  }

  function smile(d = 'M96 126 Q120 146 144 126', color = INK, width = 7) {
    return line(d, color, width);
  }

  function grin() {
    return `<path d="M88 122 Q120 172 152 122 Z" fill="#5b2238"/>`
      + `<path d="M104 146 Q120 162 136 146" fill="#ff7f9c"/>`;
  }

  function frown(d = 'M98 144 Q120 124 142 144') {
    return line(d, INK, 7);
  }

  function caption(text, fill, size = 28, y = 224) {
    return `<text x="120" y="${y}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="${size}" font-weight="900" letter-spacing="1.2" fill="${fill}" stroke="#ffffff" stroke-width="8" paint-order="stroke">${text}</text>`;
  }

  function sparkle(cx, cy, r, fill = '#ffffff') {
    return `<path d="M${cx} ${cy - r} L${cx + r * 0.28} ${cy - r * 0.28} L${cx + r} ${cy} L${cx + r * 0.28} ${cy + r * 0.28} L${cx} ${cy + r} L${cx - r * 0.28} ${cy + r * 0.28} L${cx - r} ${cy} L${cx - r * 0.28} ${cy - r * 0.28} Z" fill="${fill}" ${FINE}/>`;
  }

  function miniHeart(cx, cy, scale = 0.32, fill = '#ff4d6d') {
    return `<path d="M50 88 C24 68 8 50 8 32 C8 16 20 6 34 6 C42 6 48 10 50 16 C52 10 58 6 66 6 C80 6 92 16 92 32 C92 50 76 68 50 88 Z" transform="translate(${cx} ${cy}) scale(${scale}) translate(-50 -50)" fill="${fill}" ${OUT}/>`;
  }

  const stickerList = [
    // ---------- Reakcje ----------
    {
      id: 'hej',
      category: 'Reakcje',
      labelPl: 'Hej!',
      labelEn: 'Hey!',
      tags: 'hej hey czesc cześć hello hi machanie wave witaj',
      svg: svg(
        `${face('#ffd45f')}
         ${dot(95, 92, 6.5)}${glint(97, 90)}
         ${line('M134 93 Q144 83 154 93', INK, 6.5)}
         ${blush()}
         ${grin()}
         <path d="M176 138c-10-8-14-21-9-33l8-21c2-6 9-9 15-7 6 2 9 8 7 14l-4 12 8-24c2-6 8-9 14-7 6 1 9 8 7 14l-8 25 9-17c2-6 8-9 14-7 6 2 9 9 6 15l-14 28c-8 17-25 25-42 17z" fill="#ffd45f" ${OUT}/>
         ${line('M164 86 Q152 78 140 82', '#ff9d2e', 6)}
         ${line('M160 102 Q148 96 136 100', '#ff9d2e', 6)}
         ${sparkle(190, 70, 13, '#ffe98a')}
         ${caption('HEJ!', '#ff7043', 30)}`,
      ),
    },
    {
      id: 'ok',
      category: 'Reakcje',
      labelPl: 'OK!',
      labelEn: 'OK!',
      tags: 'ok okej super zgoda yes dobrze kciuk thumbs up',
      svg: svg(
        `${face('#55d68b')}
         ${eyesHappy()}
         ${blush()}
         ${smile('M98 128 Q120 148 142 128')}
         ${circle(190, 50, 25, '#2fbf71')}
         <path d="M178 50 L187 60 L203 40" fill="none" stroke="#ffffff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
         ${sparkle(56, 54, 12, '#a9f5c9')}
         ${sparkle(42, 150, 8, '#a9f5c9')}
         ${caption('OK!', '#128a5b', 30)}`,
      ),
    },
    {
      id: 'brawo',
      category: 'Reakcje',
      labelPl: 'Brawo!',
      labelEn: 'Bravo!',
      tags: 'brawo bravo gratulacje oklaski clap applause wygrana trophy puchar',
      svg: svg(
        `${path('M84 56h72v30c0 27-16 48-36 54-20-6-36-27-36-54z', '#ffc94d')}
         <rect x="78" y="45" width="84" height="20" rx="10" fill="#ffd86b" ${OUT}/>
         ${path('M78 70C58 70 50 82 54 96c4 16 20 22 34 16V96c-12 4-20 0-20-8 0-8 4-10 12-8z', '#ffc94d')}
         ${path('M162 70c20 0 28 12 24 26-4 16-20 22-34 16V96c12 4 20 0 20-8 0-8-4-10-12-8z', '#ffc94d')}
         <rect x="112" y="138" width="16" height="24" fill="#ffc94d" ${OUT}/>
         <rect x="92" y="158" width="56" height="16" rx="8" fill="#ffd86b" ${OUT}/>
         ${sparkle(120, 86, 17, '#ffffff')}
         ${sparkle(58, 44, 10, '#ffe98a')}
         ${sparkle(186, 38, 12, '#ffe98a')}
         ${sparkle(198, 130, 9, '#ffe98a')}
         ${line('M44 120l-12 6', '#ffc94d', 7)}
         ${line('M192 108l12-6', '#ffc94d', 7)}
         ${caption('BRAWO!', '#e88b16', 25)}`,
      ),
    },
    {
      id: 'lol',
      category: 'Reakcje',
      labelPl: 'LOL',
      labelEn: 'LOL',
      tags: 'lol smiech śmiech laugh laughing lolol haha',
      svg: svg(
        `${face('#ffd45f')}
         ${eyesHappy(90, 25)}
         ${blush(116)}
         ${grin()}
         <path d="M66 118c-8 13-6 24 3 24s11-11 3-24z" fill="#65c7ff" ${OUT}/>
         <path d="M174 118c8 13 6 24-3 24s-11-11-3-24z" fill="#65c7ff" ${OUT}/>
         ${sparkle(44, 68, 10, '#ffe98a')}
         ${sparkle(196, 62, 12, '#ffe98a')}
         ${caption('LOL', '#f2a30f', 30)}`,
      ),
    },
    {
      id: 'wow',
      category: 'Reakcje',
      labelPl: 'Wow!',
      labelEn: 'Wow!',
      tags: 'wow szok surprise amazed zdziwienie',
      svg: svg(
        `${face('#ffe08a')}
         ${eyesWide(92, 25)}
         ${line('M80 70 Q92 62 104 68', INK, 5.5)}
         ${line('M136 68 Q148 62 160 70', INK, 5.5)}
         <ellipse cx="120" cy="137" rx="12" ry="16" fill="#5b2238"/>
         ${blush(126)}
         ${line('M58 78l-10-12', '#ffb02e', 8)}
         ${line('M182 78l10-12', '#ffb02e', 8)}
         ${line('M48 112l-14-4', '#ffb02e', 8)}
         ${line('M192 112l14-4', '#ffb02e', 8)}
         ${caption('WOW!', '#3d8bfd', 29)}`,
      ),
    },
    {
      id: 'spoko',
      category: 'Reakcje',
      labelPl: 'Spoko',
      labelEn: 'Chill',
      tags: 'spoko chill cool okulary sunglasses luz relaks',
      svg: svg(
        `${face('#55d6c2')}
         <rect x="78" y="78" width="36" height="25" rx="11" fill="#23283d" ${OUT}/>
         <rect x="126" y="78" width="36" height="25" rx="11" fill="#23283d" ${OUT}/>
         <path d="M114 88h12" stroke="#23283d" stroke-width="7" stroke-linecap="round"/>
         <path d="M84 84l16 0" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity="0.55"/>
         ${smile('M102 132 Q122 142 142 126')}
         ${blush(126)}
         ${sparkle(194, 62, 12, '#c7fff5')}
         ${caption('SPOKO', '#0b8a80', 25)}`,
      ),
    },
    {
      id: 'serce',
      category: 'Reakcje',
      labelPl: 'Serce',
      labelEn: 'Heart',
      tags: 'serce milosc miłość love heart czerwone czerwony',
      svg: svg(
        `${path('M120 198C94 176 42 143 42 99 42 70 65 49 92 49c15 0 24 7 28 17 4-10 13-17 28-17 27 0 50 21 50 50 0 44-52 77-78 99z', '#ff4d6d')}
         <ellipse cx="82" cy="84" rx="20" ry="11" fill="#ffffff" opacity="0.28" transform="rotate(-32 82 84)"/>
         <text x="120" y="119" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="30" font-weight="900" letter-spacing="2" fill="#ffffff">LOVE</text>
         ${sparkle(52, 46, 14, '#ffd166')}
         ${sparkle(196, 54, 10, '#ffd166')}
         ${sparkle(202, 154, 8, '#ffd166')}`,
      ),
    },
    {
      id: 'dzieki',
      category: 'Reakcje',
      labelPl: 'Dzięki!',
      labelEn: 'Thanks!',
      tags: 'dzieki dzięki thanks thank you dziekuje dziękuję',
      svg: svg(
        `${face('#ffb07c')}
         ${eyesHappy(92, 25)}
         ${blush()}
         ${smile('M98 128 Q120 150 142 128')}
         ${miniHeart(176, 48, 0.34)}
         ${miniHeart(52, 64, 0.22, '#ff8fab')}
         ${sparkle(198, 102, 9, '#ffe0cc')}
         ${caption('DZIĘKI!', '#d16532', 24)}`,
      ),
    },

    // ---------- Emocje ----------
    {
      id: 'milosc',
      category: 'Emocje',
      labelPl: 'Miłość',
      labelEn: 'Love',
      tags: 'milosc miłość love serce serca zakochany heart eyes',
      svg: svg(
        `${face('#ff9fba')}
         ${miniHeart(90, 94, 0.31)}
         ${miniHeart(150, 94, 0.31)}
         ${blush(122)}
         ${grin()}
         ${miniHeart(44, 56, 0.24, '#ff5c8a')}
         ${miniHeart(198, 48, 0.28, '#ff5c8a')}
         ${miniHeart(204, 132, 0.2, '#ff8fab')}
         ${sparkle(60, 156, 10, '#ffe0ea')}`,
      ),
    },
    {
      id: 'smutek',
      category: 'Emocje',
      labelPl: 'Smutek',
      labelEn: 'Sad',
      tags: 'smutek smutny sad placz płacz lzy łzy',
      svg: svg(
        `${face('#7cc8ff')}
         ${eyes(94, 25, 6.5)}
         ${line('M80 74 Q92 68 104 74', INK, 5.5)}
         ${line('M136 74 Q148 68 160 74', INK, 5.5)}
         ${frown()}
         ${blush(126)}
         <path d="M170 112c-8 13-6 25 3 25s11-12 3-25z" fill="#4fb3ff" ${OUT}/>
         <path d="M58 44c14-10 34-6 38 6 4-12 24-16 38-6 10 8 8 22-4 31H62c-12-9-14-23-4-31z" fill="#d7e8ff" ${OUT}/>
         ${line('M74 86l-4 10', '#4fb3ff', 5)}
         ${line('M92 88l-4 10', '#4fb3ff', 5)}`,
      ),
    },
    {
      id: 'zlosc',
      category: 'Emocje',
      labelPl: 'Złość',
      labelEn: 'Angry',
      tags: 'zlosc złość angry wsciekly wściekły gniew',
      svg: svg(
        `${face('#ff6b6b')}
         ${eyes(96, 25, 6.5)}
         ${line('M80 74 L102 83', INK, 6.5)}
         ${line('M160 74 L138 83', INK, 6.5)}
         <rect x="94" y="126" width="52" height="22" rx="9" fill="#ffffff" stroke="${INK}" stroke-width="4"/>
         ${line('M107 127v20', '#c44b58', 3)}
         ${line('M120 127v20', '#c44b58', 3)}
         ${line('M133 127v20', '#c44b58', 3)}
         <path d="M40 78c-12-4-18-16-12-26 5-9 18-11 26-4-4 8-4 18 0 26z" fill="#d7d7e4" ${OUT}/>
         <path d="M200 78c12-4 18-16 12-26-5-9-18-11-26-4 4 8 4 18 0 26z" fill="#d7d7e4" ${OUT}/>
         ${line('M54 58l-8-8', '#d7d7e4', 6)}
         ${line('M186 58l8-8', '#d7d7e4', 6)}`,
      ),
    },
    {
      id: 'strach',
      category: 'Emocje',
      labelPl: 'Strach',
      labelEn: 'Scared',
      tags: 'strach scared boje sie boję się przestraszony panika',
      svg: svg(
        `${face('#c3b5ff')}
         ${eyesWide(92, 26)}
         ${line('M80 68 Q92 60 104 66', INK, 5)}
         ${line('M136 66 Q148 60 160 68', INK, 5)}
         <path d="M96 138 Q106 128 116 138 Q126 148 136 138 Q146 128 154 138" fill="none" stroke="${INK}" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>
         <path d="M172 104c-8 14-6 26 3 26s11-12 3-26z" fill="#65c7ff" ${OUT}/>
         ${line('M56 52l-8-10', '#8f7ae8', 7)}
         ${line('M184 52l8-10', '#8f7ae8', 7)}
         ${line('M44 120l-12 2', '#8f7ae8', 7)}`,
      ),
    },
    {
      id: 'sen',
      category: 'Emocje',
      labelPl: 'Sen',
      labelEn: 'Sleepy',
      tags: 'sen dobranoc good night sleepy zmeczony zmęczony spanie',
      svg: svg(
        `${face('#8a90d8')}
         ${eyesHappy(96, 25)}
         <ellipse cx="120" cy="132" rx="9" ry="12" fill="#4a3e68"/>
         ${blush(124)}
         <path d="M64 70C72 30 118 14 164 36c-16 5-24 20-20 34z" fill="#5b6ee1" ${OUT}/>
         <path d="M64 70c16-4 48-4 80 0" fill="none" stroke="#ffffff" stroke-width="14" stroke-linecap="round"/>
         ${circle(168, 33, 14, '#ffffff')}
         <text x="186" y="82" font-family="Segoe UI, Arial, sans-serif" font-size="28" font-weight="900" fill="#6c5ce7" stroke="#ffffff" stroke-width="6" paint-order="stroke">Z</text>
         <text x="204" y="58" font-family="Segoe UI, Arial, sans-serif" font-size="21" font-weight="900" fill="#6c5ce7" stroke="#ffffff" stroke-width="5" paint-order="stroke">Z</text>
         ${sparkle(48, 58, 9, '#d9d7ff')}`,
      ),
    },

    // ---------- Zwierzęta ----------
    {
      id: 'kot',
      category: 'Zwierzęta',
      labelPl: 'Kot',
      labelEn: 'Cat',
      tags: 'kot koty cat cats kicia miauczy zwierze zwierzę',
      svg: svg(
        `${path('M64 56 L52 18 L98 36 Z', '#ffb35c')}
         ${path('M176 56 L188 18 L142 36 Z', '#ffb35c')}
         ${path('M68 51 L61 30 L88 40 Z', '#ff8fab')}
         ${path('M172 51 L179 30 L152 40 Z', '#ff8fab')}
         ${face('#ffb35c', 112, 70)}
         <ellipse cx="68" cy="132" rx="15" ry="9" fill="#ff8fab" opacity="0.55"/>
         <ellipse cx="172" cy="132" rx="15" ry="9" fill="#ff8fab" opacity="0.55"/>
         ${eyes(100, 27, 7)}
         <path d="M114 121 L126 121 L120 129 Z" fill="#ff7f9c"/>
         ${line('M120 129 Q112 138 104 132', INK, 4.5)}
         ${line('M120 129 Q128 138 136 132', INK, 4.5)}
         ${line('M82 126 L48 118', '#8a5a35', 4)}
         ${line('M82 136 L48 140', '#8a5a35', 4)}
         ${line('M158 126 L192 118', '#8a5a35', 4)}
         ${line('M158 136 L192 140', '#8a5a35', 4)}`,
      ),
    },
    {
      id: 'pies',
      category: 'Zwierzęta',
      labelPl: 'Pies',
      labelEn: 'Dog',
      tags: 'pies psy dog dogs piesek hau zwierze zwierzę',
      svg: svg(
        `${ellipse(58, 110, 23, 43, '#a96b3f', 'transform="rotate(14 58 110)"')}
         ${ellipse(182, 110, 23, 43, '#a96b3f', 'transform="rotate(-14 182 110)"')}
         ${face('#d99a62', 108, 68)}
         ${ellipse(120, 136, 42, 31, '#ffe0b8')}
         ${eyes(98, 25, 6.5)}
         <ellipse cx="120" cy="124" rx="12" ry="8" fill="#3a2a24"/>
         ${line('M120 132 Q112 142 104 136', INK, 4.5)}
         ${line('M120 132 Q128 142 136 136', INK, 4.5)}
         <path d="M110 146 Q120 164 130 146 Q120 154 110 146Z" fill="#ff7f9c" ${FINE}/>
         ${blush(126, 48)}`,
      ),
    },
    {
      id: 'panda',
      category: 'Zwierzęta',
      labelPl: 'Panda',
      labelEn: 'Panda',
      tags: 'panda pandy bear zwierze zwierzę bambus',
      svg: svg(
        `${circle(68, 52, 23, '#2f2f3d')}
         ${circle(172, 52, 23, '#2f2f3d')}
         ${face('#fff5e8', 110, 70)}
         <ellipse cx="92" cy="98" rx="20" ry="27" fill="#2f2f3d" transform="rotate(22 92 98)"/>
         <ellipse cx="148" cy="98" rx="20" ry="27" fill="#2f2f3d" transform="rotate(-22 148 98)"/>
         ${dot(94, 99, 7, '#ffffff')}${dot(147, 99, 7, '#ffffff')}
         ${dot(95, 100, 3.5)}${dot(146, 100, 3.5)}
         <ellipse cx="120" cy="126" rx="11" ry="7" fill="#2f2f3d"/>
         ${line('M120 133 Q112 142 104 136', INK, 4.5)}
         ${line('M120 133 Q128 142 136 136', INK, 4.5)}
         ${blush(132, 48)}`,
      ),
    },
    {
      id: 'pingwin',
      category: 'Zwierzęta',
      labelPl: 'Pingwin',
      labelEn: 'Penguin',
      tags: 'pingwin penguin zwierze zwierzę zima lód lod',
      svg: svg(
        `${ellipse(120, 126, 72, 82, '#33405e')}
         ${ellipse(120, 138, 48, 62, '#fff9ee')}
         <path d="M50 122c-18 14-22 44-8 58 14 12 28-2 30-26z" fill="#33405e" ${OUT}/>
         <path d="M190 122c18 14 22 44 8 58-14 12-28-2-30-26z" fill="#33405e" ${OUT}/>
         ${ellipse(120, 96, 44, 40, '#fff9ee')}
         ${dot(102, 90, 6.5)}${dot(138, 90, 6.5)}
         ${glint(104, 88, 2)}${glint(140, 88, 2)}
         <path d="M106 108 L120 98 L134 108 L120 116 Z" fill="#ffa62e" ${OUT}/>
         <path d="M92 184c10-8 22-8 28 0-10 8-22 8-28 0z" fill="#ffa62e" ${OUT}/>
         <path d="M120 184c10-8 22-8 28 0-10 8-22 8-28 0z" fill="#ffa62e" ${OUT}/>
         ${sparkle(190, 62, 10, '#c8e8ff')}`,
      ),
    },
    {
      id: 'zaba',
      category: 'Zwierzęta',
      labelPl: 'Żaba',
      labelEn: 'Frog',
      tags: 'zaba żaba frog frogs zielona zwierze zwierzę',
      svg: svg(
        `${circle(78, 70, 29, '#65d46e')}
         ${circle(162, 70, 29, '#65d46e')}
         ${ellipse(120, 128, 79, 63, '#65d46e')}
         ${circle(78, 67, 17, '#ffffff')}
         ${circle(162, 67, 17, '#ffffff')}
         ${dot(78, 69, 7)}${dot(162, 69, 7)}
         ${glint(80, 66, 2.2)}${glint(164, 66, 2.2)}
         ${smile('M76 128 Q120 166 164 128', INK, 7)}
         ${dot(112, 116, 2.5, '#3d8b45')}${dot(128, 116, 2.5, '#3d8b45')}
         ${blush(140, 52)}
         ${sparkle(200, 104, 9, '#c8ffbc')}`,
      ),
    },

    // ---------- Jedzenie ----------
    {
      id: 'pizza',
      category: 'Jedzenie',
      labelPl: 'Pizza',
      labelEn: 'Pizza',
      tags: 'pizza jedzenie food ser wloska włoska',
      svg: svg(
        `<g transform="rotate(-8 120 120)">
         ${path('M120 28 L204 196 Q120 222 36 196 Z', '#ffd166')}
         ${path('M36 196 Q120 222 204 196 L196 174 Q120 196 44 174 Z', '#d98b3a')}
         <circle cx="96" cy="102" r="15" fill="#ef4b4b" ${FINE}/>
         <circle cx="142" cy="128" r="13" fill="#ef4b4b" ${FINE}/>
         <circle cx="112" cy="160" r="12" fill="#ef4b4b" ${FINE}/>
         <circle cx="158" cy="168" r="10" fill="#ef4b4b" ${FINE}/>
         <path d="M120 70c8 10 20 12 30 8-2 12-12 20-22 20s-20-8-22-20c10 4 22 2 30-8z" fill="#66c96b" ${FINE}/>
         <path d="M78 146c10 4 18 4 26 0-2 10-8 16-16 16s-14-6-16-16z" fill="#66c96b" ${FINE}/>
         ${sparkle(52, 72, 10, '#fff3c4')}
         ${sparkle(196, 58, 8, '#fff3c4')}
         </g>`,
      ),
    },
    {
      id: 'kawa',
      category: 'Jedzenie',
      labelPl: 'Kawa',
      labelEn: 'Coffee',
      tags: 'kawa coffee kawe kawę napoj napój cieplo ciepło',
      svg: svg(
        `${line('M180 108c34 0 38 48 4 54', '#ffffff', 36)}
         ${line('M180 108c34 0 38 48 4 54', '#fff4e0', 26)}
         ${line('M180 108c34 0 38 48 4 54', '#e8c49a', 14)}
         ${ellipse(120, 198, 82, 14, '#f2d8b8')}
         <path d="M62 90h116l-12 82c-2 13-12 22-25 22h-42c-13 0-23-9-25-22z" fill="#fff4e0" ${OUT}/>
         ${ellipse(120, 90, 58, 14, '#7a4a2b')}
         ${ellipse(120, 88, 45, 7, '#9a613a')}
         ${line('M90 48c-10 12 10 18 0 30', '#d9b38c', 7)}
         ${line('M120 40c-10 12 10 18 0 30', '#d9b38c', 7)}
         ${line('M150 48c-10 12 10 18 0 30', '#d9b38c', 7)}
         ${miniHeart(120, 140, 0.38, '#ff6b8b')}
         ${sparkle(58, 54, 9, '#ffe6c4')}`,
      ),
    },
    {
      id: 'tort',
      category: 'Jedzenie',
      labelPl: 'Tort',
      labelEn: 'Cake',
      tags: 'tort cake urodziny birthday ciasto slodkie słodkie',
      svg: svg(
        `${ellipse(120, 204, 86, 13, '#f2d8b8')}
         <rect x="38" y="132" width="164" height="58" rx="18" fill="#f7b267" ${OUT}/>
         <rect x="46" y="152" width="148" height="10" rx="5" fill="#ffdf8f"/>
         ${path('M40 110c0-14 14-24 32-24h96c18 0 32 10 32 24v34c-10-10-20-10-30 0-10-10-20-10-30 0-10-10-20-10-30 0-10-10-20-10-30 0-10-10-20-10-30 0z', '#ff8fab')}
         <rect x="114" y="54" width="12" height="50" rx="6" fill="#7cc8ff" ${OUT}/>
         <path d="M120 34c-9 8-8 20 0 20s9-12 0-20z" fill="#ffc94d" ${OUT}/>
         <circle cx="72" cy="136" r="5" fill="#ffffff"/>
         <circle cx="96" cy="150" r="4" fill="#7c5cff"/>
         <circle cx="146" cy="142" r="4.5" fill="#55d68b"/>
         <circle cx="170" cy="154" r="4" fill="#ffc94d"/>
         ${sparkle(50, 62, 9, '#ffe0ea')}
         ${sparkle(196, 72, 11, '#ffe0ea')}`,
      ),
    },

    // ---------- Impreza ----------
    {
      id: 'impreza',
      category: 'Impreza',
      labelPl: 'Impreza',
      labelEn: 'Party',
      tags: 'impreza party urodziny birthday konfetti confetti zabawa',
      svg: svg(
        `${path('M36 202 L90 88 L148 146 Z', '#7c5cff')}
         <path d="M52 186 L92 100" stroke="#a58dff" stroke-width="14" stroke-linecap="round"/>
         <path d="M66 196 L106 110" stroke="#a58dff" stroke-width="8" stroke-linecap="round"/>
         <path d="M100 96c22 6 34 18 40 40" fill="none" stroke="#ffc94d" stroke-width="7" stroke-linecap="round"/>
         <rect x="154" y="54" width="18" height="32" rx="5" fill="#ff5c8a" transform="rotate(24 163 70)" ${FINE}/>
         <rect x="190" y="96" width="16" height="28" rx="5" fill="#55d68b" transform="rotate(-30 198 110)" ${FINE}/>
         <rect x="146" y="118" width="14" height="26" rx="5" fill="#ffc94d" transform="rotate(62 153 131)" ${FINE}/>
         <circle cx="178" cy="36" r="9" fill="#65c7ff" ${FINE}/>
         <circle cx="210" cy="150" r="8" fill="#ff8fab" ${FINE}/>
         <circle cx="128" cy="42" r="7" fill="#ffc94d" ${FINE}/>
         ${sparkle(152, 84, 14, '#ffffff')}
         ${sparkle(204, 62, 10, '#ffffff')}
         ${line('M132 28l6-14', '#ff5c8a', 6)}
         ${line('M214 112l14 4', '#55d68b', 6)}`,
      ),
    },
    {
      id: 'rakieta',
      category: 'Impreza',
      labelPl: 'Rakieta',
      labelEn: 'Rocket',
      tags: 'rakieta rocket start szybko szybki kosmos space',
      svg: svg(
        `<g transform="rotate(8 120 120)">
         ${path('M120 24c31 27 43 66 36 112H84c-7-46 5-85 36-112z', '#fff9ee')}
         ${path('M120 24c18 16 30 38 35 64-12-8-23-12-35-12s-23 4-35 12c5-26 17-48 35-64z', '#ff5c6c')}
         ${circle(120, 94, 23, '#65c7ff')}
         ${circle(120, 94, 15, '#b9ecff')}
         ${path('M84 112c-18 14-24 32-20 52 16-12 28-24 34-40z', '#ff5c6c')}
         ${path('M156 112c18 14 24 32 20 52-16-12-28-24-34-40z', '#ff5c6c')}
         ${path('M94 144h52l-8 30h-36z', '#c9cfe6')}
         ${path('M104 174c4 20 10 32 16 38 6-6 12-18 16-38z', '#ffa62e')}
         ${path('M111 174c2 12 5 20 9 25 4-5 7-13 9-25z', '#ffe066')}
         ${sparkle(54, 72, 11, '#ffe98a')}
         ${sparkle(194, 46, 9, '#ffe98a')}
         ${sparkle(202, 158, 7, '#ffe98a')}
         ${line('M52 120l-18 4', '#ffc94d', 7)}
         ${line('M188 112l18-4', '#ffc94d', 7)}
         </g>`,
      ),
    },
    {
      id: 'ogien',
      category: 'Impreza',
      labelPl: 'Ogień',
      labelEn: 'Fire',
      tags: 'ogien ogień fire hot goraco gorąco plomien płomień',
      svg: svg(
        `${path('M120 24c30 36 62 62 60 112-2 42-27 70-60 70s-58-28-60-70c-2-32 14-52 28-74 4 24 14 36 24 24 8-10 10-38 8-62z', '#ff7a2e')}
         ${path('M120 72c18 22 36 38 34 68-1 25-16 42-34 42s-33-17-34-42c-1-20 8-34 18-48 2 14 7 22 13 16 5-6 5-22 3-36z', '#ffc94d')}
         ${eyes(122, 20, 5.5)}
         ${smile('M102 142 Q120 156 138 142', '#7a3b14', 6)}
         ${sparkle(50, 62, 10, '#ffe98a')}
         ${sparkle(194, 76, 12, '#ffe98a')}
         ${sparkle(190, 158, 8, '#ffe98a')}
         ${line('M48 116l-14 4', '#ff7a2e', 7)}
         ${line('M192 120l14 6', '#ff7a2e', 7)}`,
      ),
    },
  ];

  const stickers = stickerList.map((item) => Object.freeze({ ...item }));
  const byId = new Map(stickers.map((item) => [item.id, item]));
  const categories = [...new Set(stickers.map((item) => item.category))];
  const scheme = 'chill-sticker://';
  const tokenRe = /^chill-sticker:\/\/([a-z0-9-]{2,40})$/;
  const dataUrls = new Map();

  function token(id) {
    return byId.has(id) ? `${scheme}${id}` : '';
  }

  function parse(text) {
    const match = String(text ?? '').trim().match(tokenRe);
    return match ? byId.get(match[1]) || null : null;
  }

  function dataUrl(value) {
    const sticker = typeof value === 'string' ? byId.get(value) : value;
    if (!sticker || typeof sticker.svg !== 'string') return '';
    if (!dataUrls.has(sticker.id)) {
      dataUrls.set(sticker.id, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sticker.svg)}`);
    }
    return dataUrls.get(sticker.id);
  }

  function label(value, lang = 'pl') {
    const sticker = typeof value === 'string' ? byId.get(value) : value;
    if (!sticker) return '';
    return lang === 'en' ? sticker.labelEn : sticker.labelPl;
  }

  function searchText(value) {
    const sticker = typeof value === 'string' ? byId.get(value) : value;
    if (!sticker) return '';
    return `${sticker.labelPl} ${sticker.labelEn} ${sticker.category} ${sticker.tags}`.toLowerCase();
  }

  const api = Object.freeze({
    name: 'Chill Pack',
    scheme,
    stickers,
    categories,
    byId,
    token,
    parse,
    dataUrl,
    label,
    searchText,
  });

  root.CHILL_STICKER_PACK = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
