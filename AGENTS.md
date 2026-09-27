<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Animations use the `motion` package (motion/react) and must respect useReducedMotion — consistent spring/ease-out feel.
- Saved-card library (`saved_cards`) is copied by value into scenarios — editing a library card never touches scenario cards.
