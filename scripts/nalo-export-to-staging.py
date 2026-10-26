#!/usr/bin/env python3
"""Load a Salla products export (xlsx) for Nalo into the `products` table as a
staging catalog (store_id='nalo'), so the perfume tools can be tested before
the app is installed on the store. Prints SQL (run it via the Management API).

usage: python3 -I scripts/nalo-export-to-staging.py <export.xlsx> > out.sql
"""
import sys, json, re, openpyxl

STORE = 'nalo'
ws = openpyxl.load_workbook(sys.argv[1], read_only=True).worksheets[0]
rows = list(ws.iter_rows(values_only=True))
hdr = rows[1]
H = {h: i for i, h in enumerate(hdr)}
def g(r, k):
    v = r[H[k]]
    return None if v in (None, '') else v

def lit(v):
    if v is None:
        return 'null'
    if isinstance(v, (int, float)):
        return repr(float(v))
    return "'" + str(v).replace("'", "''") + "'"

values = []
for r in rows[2:]:
    pid = g(r, 'No.')
    if not pid:
        continue
    desc = re.sub(r'<[^>]+>', ' ', str(g(r, 'الوصف') or ''))
    desc = re.sub(r'\s+', ' ', desc).strip()[:4000]
    cats = [c.strip() for c in str(g(r, 'تصنيف المنتج') or '').split(',') if c.strip()]
    price = g(r, 'سعر المنتج')
    sale = g(r, 'السعر المخفض')
    values.append('(' + ', '.join([
        lit(STORE), lit(str(pid)), lit(g(r, 'أسم المنتج')), lit(str(g(r, 'رمز المنتج sku') or '') or None),
        lit('product'), lit('sale' if g(r, 'حالة المنتج') == 'متاح' else 'hidden'),
        'true' if g(r, 'حالة المنتج') == 'متاح' else 'false',
        lit(float(sale) if sale else (float(price) if price else None)),
        lit(float(price) if price else None), lit(float(sale) if sale else None), lit('SAR'),
        lit(f'https://naloksa.com/ar/product/p{pid}'), lit(g(r, 'الماركة')),
        lit(json.dumps(cats, ensure_ascii=False)) + '::jsonb', lit(desc), "'{}'::jsonb", 'now()'
    ]) + ')')

print('begin;')
print(f"delete from products where store_id='{STORE}';")
for i in range(0, len(values), 300):
    print('insert into products (store_id, salla_product_id, name, sku, type, status, is_available, price, regular_price, sale_price, currency, url, brand, categories, description, metadata, synced_at) values')
    print(',\n'.join(values[i:i + 300]) + ';')
print('commit;')
