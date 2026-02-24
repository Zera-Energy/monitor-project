# app/domain/topic.py
def make_key(country, site_id, model, device_id):
    return f"{country}/{site_id}/{model}/{device_id}"

def parse_topic(topic: str):
    """
    기대 토픽: th/site001/pg46/001/meter
    return: (country, site_id, model, device_id, last_type)
    """
    parts = (topic or "").split("/")
    if len(parts) < 5:
        return None

    country = parts[0]
    site_id = parts[1]
    model = parts[2]
    device_id = parts[3]
    last_type = parts[4]
    return (country, site_id, model, device_id, last_type)