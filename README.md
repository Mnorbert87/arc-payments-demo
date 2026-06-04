# arc-payments-demo

A live, clickable demo of [arc-agent-guard](https://github.com/Mnorbert87/arc-agent-guard):
give a wallet spending rules, then watch the guard allow or block USDC payments on Arc
testnet. The guard logic runs in your browser; allowed payments go through your own wallet.

Live: https://mnorbert87.github.io/arc-payments-demo/

## Try it

1. Open the live link, connect MetaMask. It will offer to add Arc Testnet.
2. Get testnet USDC at https://faucet.circle.com .
3. Set a policy: a per-payment max, a daily cap, an approval threshold, and an allowlist of
   addresses you permit.
4. Try a guarded send. The guard allows it, blocks it (over a limit, or a recipient not on
   the allowlist), or asks for approval above the threshold. Every attempt is logged.

This is a static page (no backend). It shows the guardrail idea tangibly. The full stack
(streaming payments, conditional/milestone payments, x402 paying and charging) lives in the
[other repos](https://github.com/Mnorbert87).

Testnet only.

## License

MIT, see [LICENSE](LICENSE).
