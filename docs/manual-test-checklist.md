# Manual Test Checklist

Manual QA flow for the local Studio setup.

## Local environment

-   Admin: [http://127.0.0.1:8881/wp-admin/](http://127.0.0.1:8881/wp-admin/)
-   Supported free-text samples: [http://127.0.0.1:8881/wp-admin/post.php?post=12&action=edit](http://127.0.0.1:8881/wp-admin/post.php?post=12&action=edit)
-   Unsupported free-text samples: [http://127.0.0.1:8881/wp-admin/post.php?post=14&action=edit](http://127.0.0.1:8881/wp-admin/post.php?post=14&action=edit)
-   DOI + BibTeX samples: [http://127.0.0.1:8881/wp-admin/post.php?post=15&action=edit](http://127.0.0.1:8881/wp-admin/post.php?post=15&action=edit)
-   Test target post: [http://127.0.0.1:8881/wp-admin/post.php?post=13&action=edit](http://127.0.0.1:8881/wp-admin/post.php?post=13&action=edit)

## Prep

-   [ ] Open the target post (`post=13`)
-   [ ] Insert the **Bibliography** block
-   [ ] Confirm the block appears in the inserter
-   [ ] Confirm the add form is open by default
-   [ ] Confirm the textarea placeholder reads: `Add DOI(s), PubMed/PMID records, BibTeX entries, and citations in supported styles for books, articles, chapters, and webpages. Separate multiple formatted citations with a blank line.`

## Supported input checks

Source pages: `post=12`, `post=15`

-   [ ] Paste a supported **book** sample
-   [ ] Confirm one entry is added
-   [ ] Confirm pure success feedback appears in the add-form area
-   [ ] Confirm the rendered citation looks reasonable

-   [ ] Paste a supported **journal article** sample with DOI in the text
-   [ ] Confirm it parses successfully

-   [ ] Paste a supported **journal article** sample without DOI
-   [ ] Confirm it parses successfully

-   [ ] Paste a supported **chapter** sample
-   [ ] Confirm it parses successfully

-   [ ] Paste a supported **webpage/social** sample
-   [ ] Confirm it parses successfully

-   [ ] Paste a supported **review** or **thesis/dissertation** sample
-   [ ] Confirm it parses successfully

## Unsupported / failure-state checks

Source page: `post=14`

-   [ ] Paste unsupported short random text
-   [ ] Confirm parsing fails closed with the supported-input guidance notice

-   [ ] Paste a LaTeX document snippet
-   [ ] Confirm the LaTeX-specific notice appears

-   [ ] Paste a BibLaTeX citation command like `\autocite{einstein}`
-   [ ] Confirm the LaTeX-specific notice appears

-   [ ] Paste a duplicate DOI already present in the block
-   [ ] Confirm `No new citations added.` and duplicate-skip feedback appear

## DOI, PubMed/PMID, and BibTeX checks

Source page: `post=15`

-   [ ] Paste a bare DOI
-   [ ] Confirm DOI resolution succeeds

-   [ ] Paste a DOI URL form
-   [ ] Confirm DOI URL form also resolves

-   [ ] Paste `PMID:26673779`
-   [ ] Confirm PubMed/PMID resolution succeeds

-   [ ] Paste a BibTeX book entry
-   [ ] Confirm it parses

-   [ ] Paste a BibTeX article entry
-   [ ] Confirm it parses

## Editing checks

-   [ ] Click a citation row
-   [ ] Confirm it opens the expected editing mode

-   [ ] Press `Escape` during plain-text editing
-   [ ] Confirm edit mode exits and focus returns to the entry

-   [ ] Open **Edit fields** on a heuristic/warning-marked citation
-   [ ] Confirm labels stay inside the container and inputs stretch full width
-   [ ] Update a parsed field and save
-   [ ] Confirm the citation reformats from structured data
-   [ ] Use **Edit** to create a manual display override
-   [ ] Click **Reset edits**
-   [ ] Confirm auto-format is restored

-   [ ] Delete one citation
-   [ ] Confirm `Citation removed.` success feedback appears
-   [ ] Confirm focus moves to the next entry or back to the add form if the list is empty

## Notices

-   [ ] Confirm notices render inside the block UI, attached to the add-form area
-   [ ] Confirm pure success snackbars auto-dismiss after roughly 5 seconds
-   [ ] Confirm warning/error notices persist until dismissed or replaced
-   [ ] Confirm the dismiss `×` control is visible and works
-   [ ] Confirm typing in the textarea or switching add modes clears the current notice

## Save / reload checks

-   [ ] Save/update the post
-   [ ] Reload the editor
-   [ ] Confirm no block validation error appears
-   [ ] Confirm citations persist and remain sorted for the current style

## Frontend/output checks

-   [ ] View the post on the frontend
-   [ ] Confirm bibliography markup renders
-   [ ] Confirm heading styling matches the editor default (bold, larger, centered)
-   [ ] Confirm citation text is readable and only intended segments are italicized
-   [ ] Confirm long URLs wrap instead of overflowing the container
-   [ ] Confirm COinS spans remain hidden visually
-   [ ] Confirm no obvious escaped/unsafe HTML appears in citation text

## Pass criteria

-   Supported input samples parse successfully
-   Unsupported inputs fail closed with clear notice feedback
-   DOI, PubMed/PMID, and BibTeX samples parse successfully
-   Editing, reset, and delete flows work without block validation regressions
-   Save/reload is stable
