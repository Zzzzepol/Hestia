# Hestia

Shared household and group inventory for consumables and returnables.

## Start locally

After the first setup, start the API and Expo Go from one terminal:

```bash
cd "/Users/kinglopez/Documents/GitHub/GitHub/Hestia"
python3 run_hestia.py
```

The runner detects the Mac's current LAN address, updates `mobile/.env` when it changes, starts the API, and opens Expo. Keep the terminal running. Use `python3 run_hestia.py --setup` only for the first setup or after database migrations change. If address detection fails, pass `--ip YOUR_MAC_IP`.

- [Product and engineering plan](docs/hestia-plan.md)
- [Expo mobile app](mobile/README.md)
- [Supabase and iPhone setup](docs/supabase-connection.md)
- [Express and PostgreSQL backend](docs/backend.md)
