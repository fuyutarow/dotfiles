# detect-japanese

`detect-japanese` reads one reply from standard input and writes one JSON object. Its exit status
is `0` for `japanese-primary`, `1` for `non-japanese`, and `2` for `insufficient` (including no
human prose or input above the 64 KiB bound). Evidence reports counts only; input text is never
echoed. Fenced/inline code, URLs, paths, identifiers, and quoted reference blocks are excluded
when authored prose is available. A quote-only response is still classified, so Chinese-only text
cannot pass merely because it was quoted.

The classifier counts English evidence only inside runs of at least three plain English words on
one line, separated by spaces, tabs, commas, semicolons, or colons; identifiers, isolated terms,
and Markdown table cells do not join those runs. Japanese-primary requires at least one kana and
1.5 times the combined kana and Han count to be at least the counted English-letter total. This
weight lets concise Japanese status prose carry identifiers while a whole English sentence still
outweighs a short Japanese preface. Three or more simplified-only Han markers, at least as many as
kana, classify the reply as non-Japanese.
Without kana, short Han-only text is `insufficient` and longer Han-only prose is `non-japanese`;
Latin-only prose is non-Japanese at 16 counted English letters and otherwise insufficient.
Substantive (16+ Han characters) Han-only sentences or lines also remain rejected so a short
Japanese acknowledgement cannot promote a following Chinese sentence.

This is a deliberately bounded admission heuristic, not general Chinese/Japanese identification.
Han is shared, so short Han-only labels remain ambiguous and mixed-language prose outside these
positive-evidence rules may need human review.
