#!/usr/bin/env python3
"""
Независимый эталон для тестов: те же формулы, но на fractions.Fraction
и с другим алгоритмом (без BigInt-степеней и бинарного поиска).
Результат — tests/golden/golden.json; JS-ядро обязано совпасть до копейки.
"""
import json
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def round_half_up(x: Fraction) -> int:
    return int((x * 2 + 1) // 2)


def monthly(rate_percent: str) -> Fraction:
    return Fraction(rate_percent) / 1200


def annuity_payment(loan: int, i: Fraction, n: int) -> int:
    if i == 0:
        return round_half_up(Fraction(loan, n))
    g = (1 + i) ** n
    return round_half_up(loan * i * g / (g - 1))


def schedule(loan: int, rate_percent: str, n: int, kind: str):
    i = monthly(rate_percent)
    bal, rows = loan, []
    ann = annuity_payment(loan, i, n) if kind == "annuity" else 0
    for k in range(1, n + 1):
        interest = round_half_up(bal * i)
        if k == n:
            principal = bal
        elif kind == "differentiated":
            principal = (loan * k) // n - (loan * (k - 1)) // n
        else:
            principal = min(max(ann - interest, 0), bal)
        bal -= principal
        rows.append((principal + interest, principal, interest, bal))
    return rows


def first_payment(loan, rate_percent, n, kind):
    i = monthly(rate_percent)
    if kind == "annuity":
        return annuity_payment(loan, i, n)
    return (loan // n) + round_half_up(loan * i)


def max_loan(target: int, rate_percent: str, n: int, kind: str) -> int:
    i = monthly(rate_percent)
    if kind == "annuity":
        s0 = target / (Fraction(1, n) if i == 0 else i / (1 - (1 + i) ** -n))
        s0 = int(s0)
    else:
        s0 = int(target / (Fraction(1, n) + i))
    # 1 коп кредита меняет платёж на ~target/s0 коп, поэтому «ступенька» округления
    # платежа занимает ~s0/target значений S — сканируем с запасом на всю ступеньку.
    width = int(s0 / target) + 10 if target else 10
    best = None
    for s in range(max(s0 - 5, 0), s0 + width):
        if first_payment(s, rate_percent, n, kind) <= target:
            best = s
    return best


CASES = [
    (480_000_000, "12", 240, "annuity"),
    (480_000_000, "12", 240, "differentiated"),
    (300_000_000, "10", 180, "annuity"),
    (250_000_000, "5.99", 360, "annuity"),
    (250_000_000, "5.99", 360, "differentiated"),
    (123_456_789, "7.35", 97, "annuity"),
    (123_456_789, "7.35", 97, "differentiated"),
    (100_000_000, "0", 120, "annuity"),
    (100_000_001, "0", 120, "differentiated"),
    (99_999_999_99, "18.5", 600, "annuity"),
    (500_000, "100", 12, "annuity"),
    (100, "9.9", 1, "annuity"),
    (777_777_77, "0.01", 360, "annuity"),
]

out = {"schedules": [], "maxLoan": []}
for loan, rate, n, kind in CASES:
    rows = schedule(loan, rate, n, kind)
    out["schedules"].append({
        "loan": loan, "rate": rate, "n": n, "type": kind,
        "firstPayment": rows[0][0],
        "lastPayment": rows[-1][0],
        "totalInterest": sum(r[2] for r in rows),
        "payments": [rows[0][0], rows[n // 2][0], rows[-1][0]],
        "balances": [rows[0][3], rows[n // 2][3], rows[-1][3]],
    })

for target, rate, n, kind in [
    (5_285_358, "12", 240, "annuity"),
    (8_000_000, "12", 240, "annuity"),
    (8_000_000, "12", 240, "differentiated"),
    (12_345_67, "6.5", 120, "annuity"),
    (12_345_67, "6.5", 120, "differentiated"),
    (9_999_00, "0", 60, "annuity"),
    (9_999_00, "0", 60, "differentiated"),
    (50_000_00, "21.9", 600, "annuity"),
]:
    out["maxLoan"].append({
        "target": target, "rate": rate, "n": n, "type": kind,
        "loan": max_loan(target, rate, n, kind),
    })

dest = ROOT / "tests" / "golden" / "golden.json"
dest.parent.mkdir(parents=True, exist_ok=True)
dest.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
print("written", dest)
