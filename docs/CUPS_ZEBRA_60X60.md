# CUPS no Raspberry: fila Zebra para mídia **60×60 mm**

O app envia PDF com páginas **60 mm × 60 mm**. Se a fila CUPS estiver com **mídia padrão 60×30** (ou outro tamanho), a Zebra pode imprimir **só metade** do adesivo ou **encolher** o conteúdo.

Use uma **fila só para 60×60** (recomendado) ou altere as **opções padrão** da fila existente.

## 1. Interface web do CUPS (mais simples)

No Pi (ou com túnel SSH):

1. Abra `http://127.0.0.1:631` (no navegador do Pi ou `ssh -L 631:127.0.0.1:631 kim@IP-DO-PI` e depois `http://localhost:631` no PC).
2. **Administration** → **Manage Printers** → clique na **Zebra**.
3. **Administration** → **Set Default Options** (ou **Modify Printer** → continuar até opções).
4. Em **Media Size**, **Page Size**, **Label** ou **Custom**:
   - escolha **60×60 mm**, **60 mm × 60 mm**, **Square 60×60** ou equivalente, **se existir**;
   - ou **Custom** com **largura 60 mm** e **altura 60 mm** (nomes variam conforme o PPD `zebra.ppd` / Zebra Universal).
5. **Set Default Options** / **Save**.
6. Anote o **nome exato da fila** (`lpstat -p`) e use em:
   - `~/pi-print-ws/.env` → `CUPS_QUEUE=...`
   - Supabase → `config_impressao_pi.cups_queue` (linha **indústria** ou a ponte que imprime 60×60).

## 2. Segunda fila no mesmo USB (60×30 numa, 60×60 na outra)

Útil quando o **Pi de estoque** imprime **60×30** e a **mesma** impressora (ou outra) precisa de **60×60** sem ficar trocando opção na mão.

```bash
# Ver URI USB da fila que já funciona (ex.: ZebraZD220)
lpstat -v ZebraZD220
# Saída exemplo: device for ZebraZD220: usb://Zebra%20Technologies/...
```

Copie o URI após `device for ...:` e crie a nova fila:

```bash
sudo lpadmin -p ZebraZD220-6060 -E \
  -v 'COLE_AQUI_O_URI_USB' \
  -m drv:///sample.drv/zebra.ppd
```

Depois defina o tamanho **60×60** como padrão **desta** fila (passo 1 na web) **ou** tente pela linha de comando (depende do PPD):

```bash
lpoptions -p ZebraZD220-6060 -l | grep -iE 'page|media|label|size'
```

Exemplos que **às vezes** aparecem (valores reais vêm do comando acima):

- `lpadmin -p ZebraZD220-6060 -o PageSize=w170h170` — ~60 mm × 60 mm em unidades **1/72 pol** (60 ÷ 25,4 × 72 ≈ 170).
- `lpadmin -p ZebraZD220-6060 -o media=Custom.60x60mm` — só se o PPD listar exatamente essa opção.

Se nada casar, use **só a interface web** para escolher o tamanho e gravar como padrão.

## 3. Conferir o padrão da fila

```bash
lpoptions -p ZebraZD220-6060
lpstat -p ZebraZD220-6060 -l
```

## 4. Teste rápido pelo CUPS

```bash
lp -d ZebraZD220-6060 /usr/share/cups/data/testprint
```

(Se o teste for A4, pode sair estranho em térmica — o importante é validar **sem erro** e depois testar pelo app **60×60**.)

## 5. Ligação com `pi-print-ws`

- O `lp` usa a fila em `CUPS_QUEUE` no `.env` do serviço.
- O app pode enviar `queue` no JSON; se não enviar, vale o `.env`.
- Para **indústria / Etiquetas 60×60**, `cups_queue` no Supabase deve ser o nome da fila **calibrada em 60×60**.

## 6. Script auxiliar no repositório

`scripts/pi-print-ws/cups-adicionar-fila-60x60.sh` — duplica uma fila existente para outro nome; **você ainda** ajusta **Media Size** na web CUPS (ou `lpadmin -o` conforme seu PPD).
