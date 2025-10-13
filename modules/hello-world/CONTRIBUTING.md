# Contributing to Hello World Module

Thank you for your interest in contributing! This is a template module, so contributions should focus on improving the template itself to help other developers.

## What to Contribute

### ✅ Good Contributions
- Documentation improvements
- Code comment clarifications
- Better examples and patterns
- Bug fixes in the template code
- Performance optimizations
- Accessibility improvements
- Type safety enhancements

### ❌ Not Appropriate
- Feature additions specific to your use case
- Changes that deviate from ARI patterns
- Breaking changes to the template structure
- Removal of educational comments

## Development Guidelines

### Code Style
- Follow existing TypeScript conventions
- Use Prettier/ESLint (if configured in main ARI project)
- Keep comments verbose for educational purposes
- Add JSDoc comments for all exported functions

### Testing
Before submitting:
1. Test in a fresh ARI installation
2. Verify all API endpoints work
3. Check database migrations apply correctly
4. Test enable/disable functionality
5. Ensure no console errors

### Documentation
- Update README.md if adding features
- Keep code comments up to date
- Add examples for new patterns
- Document breaking changes

## Pull Request Process

1. **Fork and Clone**
   ```bash
   git clone https://github.com/your-username/ari.git
   cd ari/modules/hello-world
   ```

2. **Create Feature Branch**
   ```bash
   git checkout -b improve/better-error-handling
   ```

3. **Make Changes**
   - Follow code style guidelines
   - Add comprehensive comments
   - Update documentation

4. **Test Thoroughly**
   - Test all functionality
   - Check for regressions
   - Verify in clean install

5. **Commit with Clear Message**
   ```bash
   git commit -m "Improve error handling in API routes with retry logic"
   ```

6. **Push and Create PR**
   ```bash
   git push origin improve/better-error-handling
   ```

7. **PR Description Should Include**
   - What problem does this solve?
   - What changes were made?
   - How to test the changes?
   - Screenshots (if UI changes)

## Code Review Criteria

Your PR will be reviewed for:
- ✅ Code quality and clarity
- ✅ Documentation completeness
- ✅ Type safety
- ✅ Error handling
- ✅ Security considerations
- ✅ Performance impact
- ✅ Consistency with ARI patterns

## Questions?

- Check the main ARI documentation
- Review modules.md specification
- Open a GitHub issue for clarification

## License

By contributing, you agree that your contributions will be licensed under the same license as the ARI project.

---

Thank you for helping make this template better for everyone! 🚀
