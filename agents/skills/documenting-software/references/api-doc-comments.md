# API doc comments by language

**Read when:** writing doc comments for Rust, Python or Go code. Read only the section for the language
in use; the sections are not interchangeable.

**Source labels:** each section is single-source per language. Do not generalize one language's
format to another, and do not treat these as the house's rules outside those languages.

## Rust

- API Guidelines (C-FAILURE, should): document error conditions. rustdoc recommends a Panic section
  only; the Errors and Safety sections are should-level in the API Guidelines alone. [XS-C15]
- Examples: the API Guidelines state that each item should have an example within reason; rustdoc
  recommends examples. The strength differs between the two. [XS-C16]
- Summary: a one-sentence summary is the ideal first line (Rust's stated ideal). [XS-S06]

## Python (PEP 257)

- A docstring uses triple double quotes. A one-line docstring is a phrase ending in a full stop.
  [XS-C17]
- A multi-line docstring has a summary line, a blank line, then the detail; the closing quotes sit on
  their own line. [XS-C17]
- A module docstring lists the names it exports; a script docstring can serve as its usage text.
  [XS-C17]
- A function docstring describes arguments, return value, side effects and exceptions. These are
  should-level items in PEP 257. [XS-C15]
- PEP 257 prohibits repeating the signature in a docstring; the summary-line forms differ across
  sources (see the declared choices in SKILL.md). [XS-S06]
- The captured text does not cover private-object handling or extraction tooling. [XS-C17 limit]

## Go (Go Doc Comments)

- The first sentence is a complete sentence that begins with the declared name. [XS-C18]
- A boolean-returning function is described in the form "reports whether …". [XS-C18]
- A command's comment begins with the program name; a package comment begins with "Package". [XS-C18]
- Go's guidance uses should, typically and conventionally; it is not a checker-enforced format in the
  captured text. [XS-C18]
