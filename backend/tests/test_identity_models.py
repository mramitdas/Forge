from app.modules.identity.models import split_full_name


def test_split_full_name():
    assert split_full_name("Ada Lovelace") == ("Ada", "Lovelace")
    assert split_full_name("Cher") == ("Cher", "")
    assert split_full_name("") == ("", "")
    assert split_full_name("  Mary  Jane Watson  ") == ("Mary", "Jane Watson")
    assert split_full_name("Mary  Jane") == ("Mary", "Jane")
