# Contributing to ARI

Thank you for your interest in contributing to ARI.

ARI is source available under the Business Source License 1.1 ("BSL 1.1"). Contributions are welcome, but contributors must follow the licensing, authorship, security, and quality requirements below.

## 1. Before You Contribute

Before submitting a contribution:

1. Review the repository's `LICENSE` file.
2. Search existing issues and pull requests to avoid duplicate work.
3. For substantial features, architecture changes, security-sensitive changes, or breaking changes, open an issue or discussion before investing significant development effort.
4. Do not submit code, documentation, media, data, or other material that you do not have the legal right to contribute.

Small bug fixes, documentation improvements, tests, and other straightforward improvements may generally be submitted directly as a pull request.

## 2. Licensing of Contributions

By submitting a contribution to this repository, you represent that:

- You created the contribution yourself, or you otherwise have sufficient rights to submit it.
- The contribution does not knowingly infringe any third-party copyright, patent, trademark, trade secret, confidentiality obligation, or other right.
- You have disclosed any third-party code or other material included in the contribution and identified its applicable license.
- If you are contributing on behalf of an employer or another organization, you have authority to make the contribution on its behalf.

### Contributor License Grant

By intentionally submitting a contribution for inclusion in ARI, you grant ARI.Software a perpetual, worldwide, non-exclusive, royalty-free, irrevocable copyright license to use, reproduce, modify, prepare derivative works of, publicly display, publicly perform, distribute, and sublicense your contribution, including as part of ARI.

You also grant ARI.Software the right to distribute your contribution:

- under the Business Source License 1.1 and ARI's applicable Additional Use Grant;
- under the applicable Change License after the relevant Change Date;
- as part of commercial, proprietary, source-available, or separately licensed versions of ARI; and
- under future licenses selected by ARI.Software for ARI.

This grant does not transfer ownership of your copyright. You retain ownership of your contribution.

### Patent Grant

To the extent you control patent claims that would necessarily be infringed by your contribution alone or by its combination with ARI as submitted, you grant ARI.Software and recipients of ARI a perpetual, worldwide, non-exclusive, royalty-free patent license to make, have made, use, offer to sell, sell, import, and otherwise transfer your contribution as part of ARI.

If a separate written Contributor License Agreement applies to your contribution, that agreement controls to the extent of any conflict with this section.

ARI.Software may require a separate Contributor License Agreement for substantial, strategic, security-sensitive, or corporate contributions before merging them.

## 3. Third-Party and Open-Source Code

Do not copy third-party source code into ARI unless its license is compatible with ARI's licensing model and the contribution has been approved by the maintainers.

If your contribution adds a dependency:

- use a reputable and actively maintained package where practical;
- identify the package and its license;
- include any required copyright, attribution, license, or `NOTICE` information;
- avoid dependencies with licenses that impose incompatible copyleft or distribution requirements unless specifically approved;
- update the appropriate dependency lock file; and
- ensure the dependency is necessary and appropriately scoped.

ARI may maintain a `THIRD_PARTY_NOTICES.md` or equivalent third-party attribution file. Contributors adding dependencies must provide enough information for the maintainers to keep that file accurate.

## 4. Trademarks and Branding

Contributing to ARI does not grant any right to use ARI, ARI.Software, or associated names, logos, trademarks, service marks, or branding except as necessary to accurately identify the project or as otherwise permitted in writing.

## 5. Development Standards

Contributions should:

- follow the existing project architecture and coding conventions;
- be focused and reasonably scoped;
- avoid unrelated refactoring in the same pull request;
- include appropriate tests for new behavior and bug fixes;
- pass the project's linting, formatting, type-checking, build, and test processes;
- avoid introducing secrets, credentials, private keys, customer data, or confidential information;
- avoid unnecessary dependencies;
- preserve backward compatibility where practical; and
- include documentation for user-facing or developer-facing changes.

## 6. Security Issues

Do not publicly disclose a vulnerability that could place ARI users or deployments at risk.

For a suspected security vulnerability, use the repository's private security reporting mechanism if one is available. If no private reporting mechanism is configured, contact ARI.Software through an official private support or security channel before opening a public issue.

A security fix should not include real credentials, production data, exploit data belonging to a third party, or other sensitive information.

## 7. Pull Request Guidelines

A pull request should clearly explain:

- what changed;
- why the change is needed;
- how the change was tested;
- whether it introduces or changes dependencies;
- whether it affects security, permissions, authentication, data handling, APIs, database schemas, or backward compatibility; and
- any deployment or migration steps required.

Keep commits understandable and avoid committing generated files unless the project intentionally tracks them.

## 8. Review and Acceptance

Submitting a contribution does not guarantee that it will be accepted.

Maintainers may request changes, tests, documentation, architectural adjustments, licensing clarification, or a separate Contributor License Agreement before merging a contribution.

ARI.Software may modify, combine, decline, revert, or remove accepted contributions as part of the ongoing development and maintenance of ARI.

## 9. Code of Conduct

Contributors are expected to communicate professionally and constructively. Harassment, threats, discrimination, deliberate disruption, or abusive conduct are not acceptable in project spaces.

## 10. License

The ARI project is licensed as described in the repository's `LICENSE` file.

Third-party components remain subject to their own licenses and notices.

By submitting a contribution, you acknowledge that you have read and agree to the contribution terms in this document.
